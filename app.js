(function () {
  'use strict';

  const DATA = window.PREVIO_DATA;
  if (!DATA) throw new Error('PREVIO_DATA est indisponible. Vérifiez le chargement de data.js.');

  const STORAGE_KEY = 'previo-mvp-operationnel-v5';
  const SCHEMA_VERSION = 5;
  const CONTROL_FACTORS = { 1: 0.5, 2: 0.75, 3: 1, 4: 1.25 };
  const ACTION_STATUSES = ['À étudier', 'Décidée', 'Planifiée', 'Mise en œuvre', 'Efficacité à vérifier', 'Vérifiée efficace', 'À revoir'];
  const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const DATETIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  let storageAvailable = true;
  let activeView = 'dashboard';
  let activeModal = null;
  let focusBeforeModal = null;
  let onboardingStep = 1;
  let onboardingSelection = new Set();
  let quizDraftValue = null;
  let riskFilters = { search: '', level: 'all', validation: 'all' };
  let actionFilters = { search: '', status: 'all', priority: 'all' };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clone = value => JSON.parse(JSON.stringify(value));
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const nowISO = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = value => String(value || 'item').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid('item');
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const formatDate = value => value ? DATE_FORMATTER.format(new Date(`${value}T12:00:00`)) : 'À définir';
  const formatDateTime = value => value ? DATETIME_FORMATTER.format(new Date(value)) : 'Non daté';
  const plural = (count, singular, pluralForm) => `${count} ${count > 1 ? (pluralForm || `${singular}s`) : singular}`;

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (`00000000${(hash >>> 0).toString(16)}`).slice(-8).toUpperCase();
  }

  function makeUnit(template, packId, suffix = '') {
    const id = `unit-${packId}-${template.key}${suffix}`;
    return {
      id,
      templateKey: template.key,
      packId,
      name: template.name,
      icon: template.icon || '◇',
      people: Number(template.people) || 1,
      place: template.place || '',
      tasks: template.tasks || '',
      questionIds: clone(template.questions || Object.keys(DATA.QUESTIONS).slice(0, 8)),
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
  }

  function assessmentForState(targetState, unitId) {
    if (!targetState.assessments[unitId]) {
      targetState.assessments[unitId] = { answers: {}, participants: [], observations: '', updatedAt: null };
    }
    return targetState.assessments[unitId];
  }

  function riskIdFor(unitId, questionId) {
    return `risk-${unitId}-${questionId}`;
  }

  function calculateScore(severity, frequency, control) {
    const gross = Number(severity || 0) * Number(frequency || 0);
    const factor = CONTROL_FACTORS[Number(control)] || 1;
    return { gross, factor, residual: Math.round(gross * factor * 10) / 10 };
  }

  function riskLevel(risk) {
    if (!risk || risk.confidence === 'low') return 'unknown';
    const score = calculateScore(risk.severity, risk.frequency, risk.control).residual;
    if (score > 8) return 'high';
    if (score > 4) return 'mid';
    return 'low';
  }

  function riskLevelLabel(level) {
    return ({ high: 'Élevé', mid: 'Modéré', low: 'Maîtrisé', unknown: 'À préciser' })[level] || 'À préciser';
  }

  function answerCreatesRisk(value) {
    return value && value !== 'no';
  }

  function deriveRisk(targetState, unit, question, answer) {
    const id = riskIdFor(unit.id, question.id);
    const currentIndex = targetState.risks.findIndex(risk => risk.id === id);
    if (!answerCreatesRisk(answer?.value)) {
      if (currentIndex >= 0 && targetState.risks[currentIndex].origin === 'guided-assessment') {
        targetState.risks.splice(currentIndex, 1);
        targetState.actions.forEach(action => {
          if (action.riskId === id) action.riskId = '';
        });
      }
      return;
    }

    const selected = question.options.find(option => option.value === answer.value) || {};
    const confidence = answer.value === 'unknown' ? 'low' : 'high';
    const proposed = {
      id,
      origin: 'guided-assessment',
      unitId: unit.id,
      sourceQuestionId: question.id,
      title: question.riskTitle,
      danger: question.danger,
      situation: answer.note ? `${question.situation} Observation : ${answer.note}` : question.situation,
      exposed: `${unit.people} personne${unit.people > 1 ? 's' : ''} — ${unit.name}`,
      circumstances: question.help,
      severity: Number(question.severity) || 2,
      frequency: Number(question.frequency) || 2,
      control: Number(selected.control || 3),
      existingMeasures: answer.value === 'controlled' ? 'Mesures déclarées comme robustes par l’utilisateur ; à décrire et vérifier.' : answer.value === 'partial' ? 'Mesures existantes déclarées, à compléter dans la fiche.' : '',
      prevention: (question.prevention || []).join('\n'),
      confidence,
      validation: 'to-review',
      source: clone(question.source || DATA.SOURCES.duerp),
      specialist: question.specialist || '',
      aiTrace: {
        engine: 'local-rules-v1',
        generatedAt: nowISO(),
        input: { unitId: unit.id, questionId: question.id, answer: answer.value },
        promptVersion: 'sector-pack-2026.07'
      },
      updatedAt: nowISO()
    };

    if (currentIndex >= 0) {
      const existing = targetState.risks[currentIndex];
      targetState.risks[currentIndex] = Object.assign({}, existing, proposed, {
        id: existing.id,
        existingMeasures: existing.existingMeasures || proposed.existingMeasures,
        prevention: existing.prevention || proposed.prevention,
        validation: existing.validation === 'validated' && existing.aiTrace?.input?.answer === answer.value ? 'validated' : 'to-review'
      });
    } else {
      targetState.risks.push(proposed);
    }
  }

  function buildSnapshot(targetState) {
    return clone({
      schemaVersion: targetState.schemaVersion,
      company: targetState.company,
      units: targetState.units,
      assessments: targetState.assessments,
      risks: targetState.risks,
      actions: targetState.actions,
      collaborators: targetState.collaborators,
      events: targetState.events,
      review: targetState.review,
      generatedAt: nowISO()
    });
  }

  function createDefaultState() {
    const pack = DATA.SECTOR_PACKS.bakery;
    const units = pack.units.map(template => makeUnit(template, pack.id));
    const base = {
      schemaVersion: SCHEMA_VERSION,
      company: {
        name: 'Boulangerie Martin', siret: '', naf: '1071C', sectorId: 'bakery', employees: 6,
        address: '12 rue de l’Exemple, 59000 Lille', contactName: 'Camille Martin', contactRole: 'Dirigeante',
        email: 'camille@boulangerie-martin.fr', spst: 'SPSTI à renseigner', cse: 'no', lastReviewDate: '2026-07-12'
      },
      units,
      assessments: {},
      risks: [],
      actions: [],
      collaborators: [
        { id: 'collab-camille', name: 'Camille Martin', email: 'camille@boulangerie-martin.fr', role: 'Pilote de la démarche', scope: 'admin', status: 'Actif' },
        { id: 'collab-equipe', name: 'Équipe du fournil', email: '', role: 'Salariés contributeurs', scope: 'contribute', status: 'À associer' }
      ],
      events: [
        { id: 'event-four', type: 'Nouvel équipement', date: '2026-07-15', unitId: units[0].id, description: 'Projet de remplacement du four principal à intégrer avant validation.', status: 'open', createdAt: nowISO() }
      ],
      versions: [],
      review: { employeesInvolved: false, cseConsulted: false, spstShared: false, employerDeclaration: false, author: 'Camille Martin', lastValidatedAt: null },
      ui: { onboardingCompleted: false, activeUnitId: units[1].id, questionIndexByUnit: {}, lastView: 'dashboard' },
      audit: [{ id: uid('audit'), at: nowISO(), type: 'initialization', message: 'Démonstration initialisée.' }]
    };

    const seed = {
      [units[0].id]: ['uncontrolled', 'partial', 'partial', 'partial', 'uncontrolled', 'partial', 'controlled', 'partial', 'controlled'],
      [units[1].id]: ['partial', 'partial', 'controlled', 'uncontrolled'],
      [units[2].id]: ['partial', 'partial', 'controlled', 'no'],
      [units[3].id]: ['partial', 'uncontrolled', 'partial', 'controlled']
    };

    units.forEach(unit => {
      const assessment = assessmentForState(base, unit.id);
      const questionValues = seed[unit.id] || [];
      unit.questionIds.forEach((questionId, index) => {
        if (questionValues[index]) {
          const answer = { value: questionValues[index], note: '', answeredAt: nowISO() };
          assessment.answers[questionId] = answer;
          deriveRisk(base, unit, DATA.QUESTIONS[questionId], answer);
        }
      });
      assessment.updatedAt = nowISO();
      base.ui.questionIndexByUnit[unit.id] = Math.min(questionValues.length, Math.max(0, unit.questionIds.length - 1));
    });

    const findRisk = questionId => base.risks.find(risk => risk.sourceQuestionId === questionId);
    const actionSeed = [
      ['manual_handling', 'Réduire le poids des sacs de farine', 'Réduire l’exposition à la manutention lourde', 'Négocier un passage aux sacs de 12,5 kg et réorganiser le stockage.', 'high', 'Planifiée', 'Camille Martin', '2026-09-30', 0, 'Fournisseur farine', 'Tous les sacs reçus ≤ 12,5 kg'],
      ['machines', 'Formaliser la consignation avant nettoyage', 'Éviter tout démarrage pendant une intervention', 'Créer une fiche machine simple, former l’équipe et vérifier son application.', 'high', 'Mise en œuvre', 'Responsable fournil', '2026-08-31', 150, 'Temps interne', '100 % des machines disposent d’une fiche visible'],
      ['slips', 'Revoir le nettoyage des sols', 'Réduire les sols glissants pendant la production', 'Définir les créneaux, le matériel et le traitement immédiat des déversements.', 'mid', 'Efficacité à vérifier', 'Camille Martin', '2026-08-15', 300, 'Prestataire entretien', 'Aucun presque-accident signalé sur 3 mois'],
      ['workload', 'Organiser les périodes de pointe', 'Réduire la pression temporelle en boutique', 'Analyser les flux du week-end, fixer des priorités et prévoir un relais.', 'mid', 'À étudier', 'Dirigeante', '2026-10-15', 0, 'Réunion d’équipe', 'Pauses prises et attente client stabilisée']
    ];
    actionSeed.forEach((row, index) => {
      const risk = findRisk(row[0]);
      if (!risk) return;
      base.actions.push({
        id: `action-seed-${index + 1}`, riskId: risk.id, unitId: risk.unitId, title: row[1], objective: row[2], description: row[3],
        priority: row[4], status: row[5], owner: row[6], deadline: row[7], budget: row[8], resource: row[9], indicator: row[10],
        evidence: '', effectiveness: 'not-checked', verifiedAt: '', createdAt: nowISO(), updatedAt: nowISO()
      });
    });
    base.risks.slice(0, 7).forEach(risk => { risk.validation = 'validated'; });

    const firstSnapshot = buildSnapshot(base);
    base.versions.push({
      id: 'version-initiale', number: 1, label: 'Ébauche initiale', date: '2026-07-12', author: 'Camille Martin',
      reason: 'Création des unités et première analyse préparatoire.', createdAt: nowISO(), hash: hashString(JSON.stringify(firstSnapshot)),
      summary: snapshotSummary(firstSnapshot), snapshot: firstSnapshot
    });
    return base;
  }

  function snapshotSummary(snapshot) {
    const high = (snapshot.risks || []).filter(risk => riskLevel(risk) === 'high').length;
    return { units: snapshot.units?.length || 0, risks: snapshot.risks?.length || 0, high, actions: snapshot.actions?.length || 0 };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object') return createDefaultState();
    const fallback = createDefaultState();
    const normalized = Object.assign({}, fallback, raw);
    normalized.schemaVersion = SCHEMA_VERSION;
    normalized.company = Object.assign({}, fallback.company, raw.company || {});
    normalized.units = Array.isArray(raw.units) && raw.units.length ? raw.units.map((unit, index) => ({
      id: unit.id || uid(`unit-${index}`), templateKey: unit.templateKey || '', packId: unit.packId || normalized.company.sectorId || 'generic',
      name: unit.name || `Unité ${index + 1}`, icon: unit.icon || '◇', people: Math.max(1, Number(unit.people) || 1), place: unit.place || '', tasks: unit.tasks || '',
      questionIds: Array.isArray(unit.questionIds) && unit.questionIds.length ? unit.questionIds.filter(id => DATA.QUESTIONS[id]) : clone(DATA.SECTOR_PACKS.generic.units[0].questions),
      createdAt: unit.createdAt || nowISO(), updatedAt: unit.updatedAt || nowISO()
    })) : fallback.units;
    normalized.assessments = raw.assessments && typeof raw.assessments === 'object' ? raw.assessments : {};
    normalized.units.forEach(unit => assessmentForState(normalized, unit.id));
    normalized.risks = Array.isArray(raw.risks) ? raw.risks : fallback.risks;
    normalized.actions = Array.isArray(raw.actions) ? raw.actions : fallback.actions;
    normalized.collaborators = Array.isArray(raw.collaborators) ? raw.collaborators : fallback.collaborators;
    normalized.events = Array.isArray(raw.events) ? raw.events : fallback.events;
    normalized.versions = Array.isArray(raw.versions) ? raw.versions : fallback.versions;
    normalized.review = Object.assign({}, fallback.review, raw.review || {});
    normalized.ui = Object.assign({}, fallback.ui, raw.ui || {});
    normalized.ui.questionIndexByUnit = Object.assign({}, fallback.ui.questionIndexByUnit, raw.ui?.questionIndexByUnit || {});
    normalized.audit = Array.isArray(raw.audit) ? raw.audit : fallback.audit;
    if (!normalized.units.some(unit => unit.id === normalized.ui.activeUnitId)) normalized.ui.activeUnitId = normalized.units[0]?.id || '';
    return normalized;
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeState(JSON.parse(saved)) : createDefaultState();
    } catch (error) {
      storageAvailable = false;
      console.warn('Prévio : stockage local indisponible.', error);
      return createDefaultState();
    }
  }

  let state = loadState();

  function addAudit(type, message, details) {
    state.audit.unshift({ id: uid('audit'), at: nowISO(), type, message, details: details || null });
    state.audit = state.audit.slice(0, 250);
  }

  function saveState(message, auditType = 'update') {
    if (message) addAudit(auditType, message);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageAvailable = true;
      updateSaveIndicator();
    } catch (error) {
      storageAvailable = false;
      updateSaveIndicator();
      console.warn('Prévio : impossible d’enregistrer localement.', error);
    }
    if (message) toast(message);
  }

  function updateSaveIndicator() {
    const element = $('#save-state');
    const label = $('#save-state-label');
    if (!element || !label) return;
    element.classList.toggle('unavailable', !storageAvailable);
    label.textContent = storageAvailable ? 'Enregistré localement' : 'Sauvegarde locale indisponible';
  }

  function toast(message) {
    const region = $('#toast-region');
    if (!region) return;
    const item = document.createElement('div');
    item.className = 'toast';
    item.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg><span>${escapeHTML(message)}</span>`;
    region.appendChild(item);
    setTimeout(() => item.remove(), 3600);
  }

  function download(filename, content, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function unitById(id) { return state.units.find(unit => unit.id === id); }
  function riskById(id) { return state.risks.find(risk => risk.id === id); }
  function actionById(id) { return state.actions.find(action => action.id === id); }
  function questionsForUnit(unit) { return (unit?.questionIds || []).map(id => DATA.QUESTIONS[id]).filter(Boolean); }
  function assessmentFor(unitId) { return assessmentForState(state, unitId); }

  function unitProgress(unit) {
    const questions = questionsForUnit(unit);
    const assessment = assessmentFor(unit.id);
    const answered = questions.filter(question => assessment.answers[question.id]?.value).length;
    const unknown = questions.filter(question => assessment.answers[question.id]?.value === 'unknown').length;
    const total = questions.length;
    return { answered, total, unknown, pct: total ? Math.round(answered / total * 100) : 0, complete: total > 0 && answered === total };
  }

  function globalProgress() {
    const rows = state.units.map(unitProgress);
    const answered = rows.reduce((sum, row) => sum + row.answered, 0);
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const unknown = rows.reduce((sum, row) => sum + row.unknown, 0);
    return { answered, total, unknown, remaining: Math.max(0, total - answered), pct: total ? Math.round(answered / total * 100) : 0, completeUnits: rows.filter(row => row.complete).length };
  }

  function highRisksWithoutAction() {
    return state.risks.filter(risk => {
      if (riskLevel(risk) !== 'high') return false;
      return !state.actions.some(action => action.riskId === risk.id && !['À revoir'].includes(action.status));
    });
  }

  function nextUnitToAssess() {
    return state.units.find(unit => !unitProgress(unit).complete) || state.units[0];
  }

  function nextQuestionIndex(unit) {
    const assessment = assessmentFor(unit.id);
    const questions = questionsForUnit(unit);
    const firstMissing = questions.findIndex(question => !assessment.answers[question.id]?.value);
    if (firstMissing >= 0) return firstMissing;
    return Math.min(Number(state.ui.questionIndexByUnit[unit.id]) || 0, Math.max(questions.length - 1, 0));
  }

  function programType() {
    return Number(state.company.employees) >= 50 ? 'PAPRIPACT' : 'Liste d’actions de prévention';
  }

  function renderSectorOptions(select, selected) {
    if (!select) return;
    select.innerHTML = Object.values(DATA.SECTOR_PACKS).map(pack => `<option value="${escapeHTML(pack.id)}">${escapeHTML(pack.label)}</option>`).join('');
    select.value = DATA.SECTOR_PACKS[selected] ? selected : 'generic';
  }

  function renderAll() {
    renderTopbar();
    renderDashboard();
    renderCompany();
    renderEvaluation();
    renderQuiz();
    renderRisks();
    renderActions();
    renderReview();
    renderVersions();
    renderPrintDocument(buildSnapshot(state));
    updateTabOverflow();
  }

  function renderTopbar() {
    const currentTab = activeView === 'quiz' ? 'evaluation' : activeView;
    $$('.app-tab').forEach(tab => {
      if (tab.dataset.appview === currentTab) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    updateSaveIndicator();
  }

  function renderDashboard() {
    const progress = globalProgress();
    const high = state.risks.filter(risk => riskLevel(risk) === 'high').length;
    const unvalidated = state.risks.filter(risk => risk.validation !== 'validated').length;
    const openActions = state.actions.filter(action => action.status !== 'Vérifiée efficace').length;
    const openEvents = state.events.filter(event => event.status === 'open').length;
    $('#dashboard-title').textContent = `Bonjour, ${state.company.name || 'votre entreprise'}`;
    $('#dashboard-subtitle').textContent = `${state.company.employees || 0} salariés · ${DATA.SECTOR_PACKS[state.company.sectorId]?.label || 'Activité à préciser'} · ${programType()}`;

    $('#dashboard-kpis').innerHTML = [
      ['low', `${progress.pct}`, '%', 'Évaluation complétée', `${progress.remaining} question${progress.remaining > 1 ? 's' : ''} restante${progress.remaining > 1 ? 's' : ''}`],
      ['high', high, '', 'Risques élevés', `${highRisksWithoutAction().length} sans action suffisante`],
      ['mid', openActions, '', 'Actions ouvertes', `${state.actions.filter(action => action.status === 'Efficacité à vérifier').length} à vérifier`],
      ['', unvalidated, '', 'Risques à relire', `${progress.unknown} réponse${progress.unknown > 1 ? 's' : ''} incertaine${progress.unknown > 1 ? 's' : ''}`]
    ].map(([tone, value, suffix, label, meta]) => `<article class="kpi-card ${tone}"><div class="kpi-value">${escapeHTML(value)}<small>${escapeHTML(suffix)}</small></div><p class="kpi-label">${escapeHTML(label)}</p><p class="kpi-meta">${escapeHTML(meta)}</p></article>`).join('');

    const nextUnit = nextUnitToAssess();
    $('#dashboard-progress-card').innerHTML = `<div class="progress-card-head"><div><p class="eyebrow">Évaluation en cours</p><h2>${escapeHTML(progress.completeUnits)} unité${progress.completeUnits > 1 ? 's' : ''} sur ${state.units.length} terminée${progress.completeUnits > 1 ? 's' : ''}</h2><p class="sub">Prochaine étape : ${escapeHTML(nextUnit?.name || 'créer une unité')}</p></div><span class="badge badge-info">${progress.pct} %</span></div><div class="progress progress-large" role="progressbar" aria-valuenow="${progress.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${progress.pct}%"></i></div><div class="progress-stats"><div class="progress-stat"><strong>${progress.answered}</strong><span>réponses validées</span></div><div class="progress-stat"><strong>${state.risks.length}</strong><span>risques structurés</span></div><div class="progress-stat"><strong>${state.actions.length}</strong><span>actions suivies</span></div></div><button class="btn btn-primary" id="dashboard-continue" style="margin-top:1rem">Continuer ${escapeHTML(nextUnit?.name || 'l’évaluation')} <span class="arrow">→</span></button>`;
    $('#dashboard-continue')?.addEventListener('click', () => startUnitAssessment(nextUnit?.id));
    $('#dashboard-primary').onclick = () => startUnitAssessment(nextUnit?.id);

    const priorities = highRisksWithoutAction().slice(0, 4);
    $('#dashboard-priorities').innerHTML = priorities.length ? priorities.map(risk => {
      const unit = unitById(risk.unitId);
      return `<article class="priority-row"><span class="badge badge-high">Élevé</span><div class="priority-main"><strong>${escapeHTML(risk.title)}</strong><p>${escapeHTML(unit?.name || 'Unité supprimée')} · score ${calculateScore(risk.severity, risk.frequency, risk.control).residual}</p></div><button class="row-button" data-create-action-risk="${escapeHTML(risk.id)}">Planifier</button></article>`;
    }).join('') : '<div class="empty-state">Tous les risques élevés disposent d’une action associée.</div>';

    const upcoming = state.actions.filter(action => action.status !== 'Vérifiée efficace').sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).slice(0, 4);
    $('#dashboard-actions').innerHTML = upcoming.length ? upcoming.map(action => `<article class="deadline-row"><span class="mini-tag">${escapeHTML(formatDate(action.deadline))}</span><div class="deadline-main"><strong>${escapeHTML(action.title)}</strong><p>${escapeHTML(action.owner || 'Responsable à attribuer')} · ${escapeHTML(action.status)}</p></div><button class="row-button" data-edit-action="${escapeHTML(action.id)}">Ouvrir</button></article>`).join('') : '<div class="empty-state">Aucune action ouverte.</div>';

    const annualRequired = Number(state.company.employees) >= 11;
    $('#dashboard-compliance').innerHTML = `<div class="card-top"><div><h2>Cadre de mise à jour</h2><p class="sub">Repères adaptés à votre effectif.</p></div><span class="badge badge-info">${escapeHTML(programType())}</span></div><div class="stack"><div class="rule-row"><span class="rule-icon">${annualRequired ? '12' : '↺'}</span><div><strong>${annualRequired ? 'Mise à jour au moins annuelle' : 'Mise à jour lors des changements'}</strong><p class="sub">${annualRequired ? 'Votre effectif est d’au moins 11 salariés.' : 'L’annualité n’est pas imposée sous 11 salariés, mais les changements et informations nouvelles doivent être intégrés.'}</p></div></div><div class="rule-row"><span class="rule-icon">40</span><div><strong>Versions à conserver 40 ans</strong><p class="sub">Téléchargez et archivez chaque version validée dans un système de conservation adapté.</p></div></div><div class="rule-row"><span class="rule-icon">UT</span><div><strong>Inventaire par unité de travail</strong><p class="sub">${state.units.length} unité${state.units.length > 1 ? 's' : ''} actuellement décrite${state.units.length > 1 ? 's' : ''}.</p></div></div></div>`;

    const events = state.events.filter(event => event.status !== 'closed').slice(0, 4);
    $('#dashboard-events').innerHTML = events.length ? events.map(event => `<article class="event-row"><span class="status-dot ${event.status === 'open' ? 'progress' : 'complete'}"></span><div class="event-main"><strong>${escapeHTML(event.type)}</strong><p>${escapeHTML(event.description)} · ${escapeHTML(formatDate(event.date))}</p></div><button class="row-button" data-event-status="${escapeHTML(event.id)}">${event.status === 'open' ? 'Marquer analysé' : 'Clôturer'}</button></article>`).join('') : '<div class="empty-state">Aucun changement ouvert.</div>';

    $('#dashboard-events').querySelectorAll('[data-event-status]').forEach(button => button.addEventListener('click', () => advanceEvent(button.dataset.eventStatus)));
    $('#dashboard-priorities').querySelectorAll('[data-create-action-risk]').forEach(button => button.addEventListener('click', () => openActionModal('', button.dataset.createActionRisk)));
    $('#dashboard-actions').querySelectorAll('[data-edit-action]').forEach(button => button.addEventListener('click', () => openActionModal(button.dataset.editAction)));
  }

  function renderCompany() {
    renderSectorOptions($('#company-sector'), state.company.sectorId);
    $$('[data-company]').forEach(input => {
      const value = state.company[input.dataset.company];
      input.value = value ?? '';
    });
    $('#company-program-label').textContent = programType();

    const rules = [
      ['UT', 'Inventaire par unité de travail', 'Chaque risque est rattaché à une unité et à une situation de travail.'],
      [Number(state.company.employees) >= 11 ? '12' : '↺', Number(state.company.employees) >= 11 ? 'Actualisation annuelle minimale' : 'Actualisation déclenchée', Number(state.company.employees) >= 11 ? 'Au moins chaque année, ainsi qu’en cas de changement ou d’information nouvelle.' : 'À chaque changement important ou information nouvelle sur un risque.'],
      [Number(state.company.employees) >= 50 ? 'PA' : 'A', programType(), Number(state.company.employees) >= 50 ? 'Mesures détaillées, ressources, calendrier, indicateurs et estimation des coûts.' : 'Les actions de prévention sont consignées avec le DUERP.'],
      ['40', 'Conservation des versions', 'Prévoir un archivage durable et exportable pendant 40 ans.']
    ];
    $('#company-rules').innerHTML = rules.map(rule => `<article class="rule-row"><span class="rule-icon">${escapeHTML(rule[0])}</span><div><strong>${escapeHTML(rule[1])}</strong><p class="sub">${escapeHTML(rule[2])}</p></div></article>`).join('');

    $('#collaborator-list').innerHTML = state.collaborators.length ? state.collaborators.map(collaborator => `<article class="participant-row"><span class="participant-avatar">${escapeHTML((collaborator.name || '?').split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase())}</span><div class="participant-copy"><strong>${escapeHTML(collaborator.name)}</strong><small>${escapeHTML(collaborator.role)} · ${escapeHTML(collaborator.status || collaborator.scope)}</small></div>${collaborator.id !== 'collab-camille' ? `<button class="row-button" data-remove-collaborator="${escapeHTML(collaborator.id)}">Retirer</button>` : ''}</article>`).join('') : '<div class="empty-state">Ajoutez les personnes qui contribuent à l’évaluation.</div>';
    $('#collaborator-list').querySelectorAll('[data-remove-collaborator]').forEach(button => button.addEventListener('click', () => {
      state.collaborators = state.collaborators.filter(item => item.id !== button.dataset.removeCollaborator);
      saveState('Participant retiré.', 'collaboration');
      renderCompany();
    }));

    $('#company-unit-grid').innerHTML = state.units.map(unit => {
      const progress = unitProgress(unit);
      return `<article class="unit-card"><div class="unit-card-head"><span class="unit-symbol">${escapeHTML(unit.icon)}</span><div class="unit-card-title"><h3>${escapeHTML(unit.name)}</h3><p>${escapeHTML(unit.place || 'Lieu à préciser')}</p></div><button class="row-button" data-edit-unit="${escapeHTML(unit.id)}">Modifier</button></div><p class="sub">${escapeHTML(unit.tasks || 'Activités à préciser')}</p><div class="unit-meta"><span><b>${unit.people}</b> personne${unit.people > 1 ? 's' : ''}</span><span><b>${progress.total}</b> questions</span><span><b>${state.risks.filter(risk => risk.unitId === unit.id).length}</b> risques</span><span><b>${progress.pct} %</b> complété</span></div><div class="unit-card-actions"><button class="btn btn-light btn-sm" data-evaluate-unit="${escapeHTML(unit.id)}">Évaluer</button><button class="btn btn-light btn-sm danger-button" data-delete-unit="${escapeHTML(unit.id)}">Supprimer</button></div></article>`;
    }).join('');
    $('#company-unit-grid').querySelectorAll('[data-edit-unit]').forEach(button => button.addEventListener('click', () => openUnitModal(button.dataset.editUnit)));
    $('#company-unit-grid').querySelectorAll('[data-evaluate-unit]').forEach(button => button.addEventListener('click', () => startUnitAssessment(button.dataset.evaluateUnit)));
    $('#company-unit-grid').querySelectorAll('[data-delete-unit]').forEach(button => button.addEventListener('click', () => deleteUnit(button.dataset.deleteUnit)));
  }

  function renderEvaluation() {
    const progress = globalProgress();
    $('#evaluation-overview').innerHTML = `<div class="evaluation-overview-grid"><div class="evaluation-overview-main"><p class="eyebrow">Vue d’ensemble</p><h2>${progress.remaining ? `${progress.remaining} question${progress.remaining > 1 ? 's' : ''} à compléter` : 'Toutes les questions sont renseignées'}</h2><p class="sub">${progress.unknown ? `${progress.unknown} réponse${progress.unknown > 1 ? 's' : ''} « je ne sais pas » doit être clarifiée.` : 'Aucune incertitude déclarée.'}</p></div><div class="evaluation-metric"><strong>${progress.pct} %</strong><span>progression</span></div><div class="evaluation-metric"><strong>${state.risks.length}</strong><span>risques générés</span></div><div class="evaluation-metric"><strong>${state.risks.filter(risk => risk.validation === 'validated').length}</strong><span>validés</span></div></div>`;

    $('#evaluation-unit-grid').innerHTML = state.units.map(unit => {
      const progressUnit = unitProgress(unit);
      const status = progressUnit.complete ? 'complete' : progressUnit.answered ? 'progress' : 'todo';
      const unitRisks = state.risks.filter(risk => risk.unitId === unit.id);
      return `<article class="unit-card"><div class="unit-card-head"><span class="unit-symbol">${escapeHTML(unit.icon)}</span><div class="unit-card-title"><h3>${escapeHTML(unit.name)}</h3><p><span class="status-dot ${status}"></span>${progressUnit.complete ? 'Évaluation complète' : progressUnit.answered ? 'En cours' : 'À commencer'}</p></div><span class="mini-tag">${progressUnit.answered}/${progressUnit.total}</span></div><div class="unit-progress-line"><span>${progressUnit.unknown ? `${progressUnit.unknown} incertitude${progressUnit.unknown > 1 ? 's' : ''}` : 'Réponses exploitables'}</span><span>${progressUnit.pct} %</span></div><div class="progress"><i style="width:${progressUnit.pct}%"></i></div><div class="unit-meta"><span><b>${unitRisks.length}</b> risques</span><span><b>${unitRisks.filter(risk => riskLevel(risk) === 'high').length}</b> élevés</span></div><button class="btn ${progressUnit.complete ? 'btn-light' : 'btn-primary'}" data-evaluate-unit="${escapeHTML(unit.id)}">${progressUnit.complete ? 'Relire les réponses' : progressUnit.answered ? 'Continuer' : 'Commencer'} <span class="arrow">→</span></button></article>`;
    }).join('');
    $('#evaluation-unit-grid').querySelectorAll('[data-evaluate-unit]').forEach(button => button.addEventListener('click', () => startUnitAssessment(button.dataset.evaluateUnit)));
  }

  function startUnitAssessment(unitId) {
    const unit = unitById(unitId) || nextUnitToAssess();
    if (!unit) return;
    state.ui.activeUnitId = unit.id;
    state.ui.questionIndexByUnit[unit.id] = nextQuestionIndex(unit);
    quizDraftValue = null;
    saveState('', 'navigation');
    gotoApp('quiz');
  }

  function renderQuiz() {
    const unit = unitById(state.ui.activeUnitId) || state.units[0];
    if (!unit) return;
    const questions = questionsForUnit(unit);
    if (!questions.length) return;
    let index = Number(state.ui.questionIndexByUnit[unit.id]) || 0;
    index = Math.max(0, Math.min(index, questions.length - 1));
    state.ui.questionIndexByUnit[unit.id] = index;
    const question = questions[index];
    const assessment = assessmentFor(unit.id);
    const existing = assessment.answers[question.id] || {};
    if (quizDraftValue === null) quizDraftValue = existing.value || '';

    $('#quiz-unit-stepper').innerHTML = state.units.map(item => {
      const progress = unitProgress(item);
      return `<button class="vertical-step ${item.id === unit.id ? 'active' : ''} ${progress.complete ? 'complete' : ''}" data-quiz-unit="${escapeHTML(item.id)}"><span class="step-mark">${progress.complete ? '✓' : progress.answered}</span><span class="vertical-step-copy"><b>${escapeHTML(item.name)}</b><small>${progress.answered}/${progress.total} réponses</small></span></button>`;
    }).join('');
    $('#quiz-unit-stepper').querySelectorAll('[data-quiz-unit]').forEach(button => button.addEventListener('click', () => startUnitAssessment(button.dataset.quizUnit)));

    $('#quiz-unit-label').textContent = unit.name;
    $('#quiz-title').textContent = 'Évaluation des situations de travail';
    $('#quiz-counter').textContent = `Question ${index + 1} sur ${questions.length}`;
    $('#quiz-progress-bar').style.width = `${Math.round((index + 1) / questions.length * 100)}%`;
    $('#quiz-question-title').textContent = question.title;
    $('#quiz-question-help').textContent = question.help;
    $('#quiz-note').value = existing.note || '';
    $('#quiz-options').innerHTML = question.options.map(option => `<button class="choice-option" type="button" aria-pressed="${quizDraftValue === option.value}" data-answer-value="${escapeHTML(option.value)}"><span class="choice-radio"></span><span class="choice-copy"><b>${escapeHTML(option.label)}</b>${option.details ? `<small>${escapeHTML(option.details)}</small>` : ''}</span></button>`).join('');
    $('#quiz-options').querySelectorAll('[data-answer-value]').forEach(button => button.addEventListener('click', () => {
      quizDraftValue = button.dataset.answerValue;
      $('#quiz-options').querySelectorAll('[data-answer-value]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      $('#quiz-required-note').textContent = quizDraftValue === 'unknown' ? 'Cette réponse créera un point à clarifier.' : 'Réponse prête à être validée.';
    }));
    $('#quiz-source-note').innerHTML = `<span>Source de départ : <a href="${escapeHTML(question.source?.url || DATA.SOURCES.duerp.url)}" target="_blank" rel="noopener">${escapeHTML(question.source?.label || DATA.SOURCES.duerp.label)}</a>. La suggestion doit être adaptée au terrain.</span>`;
    $('#quiz-prev').disabled = index === 0;
    $('#quiz-next').innerHTML = index === questions.length - 1 ? 'Terminer cette unité <span class="arrow">→</span>' : 'Valider et continuer <span class="arrow">→</span>';
    $('#quiz-required-note').textContent = quizDraftValue ? (quizDraftValue === 'unknown' ? 'Cette réponse créera un point à clarifier.' : 'Réponse prête à être validée.') : 'Choisissez une réponse pour continuer.';
  }

  function saveQuizAnswerAndMove(direction) {
    const unit = unitById(state.ui.activeUnitId);
    if (!unit) return;
    const questions = questionsForUnit(unit);
    let index = Number(state.ui.questionIndexByUnit[unit.id]) || 0;
    const question = questions[index];
    if (direction > 0 && !quizDraftValue) {
      toast('Choisissez une réponse avant de continuer.');
      return;
    }
    if (quizDraftValue) {
      const assessment = assessmentFor(unit.id);
      assessment.answers[question.id] = { value: quizDraftValue, note: $('#quiz-note').value.trim(), answeredAt: nowISO() };
      assessment.updatedAt = nowISO();
      deriveRisk(state, unit, question, assessment.answers[question.id]);
    }
    if (direction < 0) index = Math.max(0, index - 1);
    else if (index < questions.length - 1) index += 1;
    else {
      saveState(`Évaluation de l’unité « ${unit.name} » enregistrée.`, 'assessment');
      quizDraftValue = null;
      renderAll();
      gotoApp('evaluation');
      return;
    }
    state.ui.questionIndexByUnit[unit.id] = index;
    quizDraftValue = null;
    saveState('', 'assessment');
    renderAll();
  }

  function renderRisks() {
    const search = riskFilters.search.toLowerCase();
    const filtered = state.risks.filter(risk => {
      const unit = unitById(risk.unitId);
      const haystack = `${risk.title} ${risk.danger} ${risk.situation} ${risk.existingMeasures} ${risk.prevention} ${unit?.name || ''}`.toLowerCase();
      const levelMatch = riskFilters.level === 'all' || riskLevel(risk) === riskFilters.level;
      const validationMatch = riskFilters.validation === 'all' || risk.validation === riskFilters.validation;
      return (!search || haystack.includes(search)) && levelMatch && validationMatch;
    }).sort((a, b) => {
      const order = { high: 0, unknown: 1, mid: 2, low: 3 };
      return order[riskLevel(a)] - order[riskLevel(b)];
    });

    const counts = ['high', 'mid', 'low', 'unknown'].map(level => [level, state.risks.filter(risk => riskLevel(risk) === level).length]);
    $('#risk-summary-strip').innerHTML = counts.map(([level, count]) => `<div class="summary-chip"><span>${riskLevelLabel(level)}</span><strong>${count}</strong></div>`).join('');
    $('#risk-register').innerHTML = filtered.length ? filtered.map(risk => {
      const unit = unitById(risk.unitId);
      const level = riskLevel(risk);
      const score = calculateScore(risk.severity, risk.frequency, risk.control);
      const relatedActions = state.actions.filter(action => action.riskId === risk.id);
      return `<article class="risk-card ${level}" data-risk-id="${escapeHTML(risk.id)}"><div class="risk-card-main"><div class="risk-card-head"><span class="badge badge-${level === 'unknown' ? 'info' : level}">${escapeHTML(riskLevelLabel(level))}</span><h3>${escapeHTML(risk.title)}</h3><span class="mini-tag">${escapeHTML(unit?.name || 'Unité supprimée')}</span></div><p>${escapeHTML(risk.situation)}</p><div class="risk-facts"><span>G ${risk.severity} × E ${risk.frequency}</span><span>Maîtrise ${risk.control}/4</span><span>${relatedActions.length} action${relatedActions.length > 1 ? 's' : ''}</span><span>Confiance ${escapeHTML(risk.confidence)}</span></div>${risk.specialist ? `<div class="source-note"><span>${escapeHTML(risk.specialist)}</span></div>` : ''}</div><div class="risk-card-side"><div class="risk-score" title="Criticité résiduelle">${level === 'unknown' ? '?' : score.residual}</div><span class="validation-mark ${risk.validation}">${risk.validation === 'validated' ? '✓ Validé' : 'À relire'}</span><button class="row-button" data-edit-risk="${escapeHTML(risk.id)}">Ouvrir la fiche</button>${relatedActions.length ? '' : `<button class="row-button" data-create-action-risk="${escapeHTML(risk.id)}">Créer une action</button>`}</div></article>`;
    }).join('') : '<div class="empty-state">Aucun risque ne correspond aux filtres.</div>';

    $('#risk-register').querySelectorAll('[data-edit-risk]').forEach(button => button.addEventListener('click', () => openRiskModal(button.dataset.editRisk)));
    $('#risk-register').querySelectorAll('[data-create-action-risk]').forEach(button => button.addEventListener('click', () => openActionModal('', button.dataset.createActionRisk)));
  }

  function renderActions() {
    $('#actions-title').textContent = programType();
    const search = actionFilters.search.toLowerCase();
    const filtered = state.actions.filter(action => {
      const risk = riskById(action.riskId);
      const unit = unitById(action.unitId);
      const haystack = `${action.title} ${action.objective} ${action.description} ${action.owner} ${risk?.title || ''} ${unit?.name || ''}`.toLowerCase();
      return (!search || haystack.includes(search)) && (actionFilters.status === 'all' || action.status === actionFilters.status) && (actionFilters.priority === 'all' || action.priority === actionFilters.priority);
    }).sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority) || (a.deadline || '9999').localeCompare(b.deadline || '9999'));

    const complete = state.actions.filter(action => action.status === 'Vérifiée efficace').length;
    const overdue = state.actions.filter(action => action.deadline && action.deadline < todayISO() && action.status !== 'Vérifiée efficace').length;
    const verify = state.actions.filter(action => action.status === 'Efficacité à vérifier').length;
    const budget = state.actions.reduce((sum, action) => sum + (Number(action.budget) || 0), 0);
    $('#action-kpis').innerHTML = [
      ['low', complete, 'Actions vérifiées', `${state.actions.length ? Math.round(complete / state.actions.length * 100) : 0} % du plan`],
      ['high', overdue, 'Échéances dépassées', 'à replanifier ou clôturer'],
      ['mid', verify, 'Efficacités à vérifier', 'preuve et résultat attendus'],
      ['', `${budget.toLocaleString('fr-FR')} €`, 'Budget estimé', programType()]
    ].map(([tone, value, label, meta]) => `<article class="kpi-card ${tone}"><div class="kpi-value">${escapeHTML(value)}</div><p class="kpi-label">${escapeHTML(label)}</p><p class="kpi-meta">${escapeHTML(meta)}</p></article>`).join('');

    $('#action-list').innerHTML = filtered.length ? filtered.map(action => {
      const risk = riskById(action.riskId);
      const unit = unitById(action.unitId);
      const completeAction = action.status === 'Vérifiée efficace';
      return `<article class="action-item" data-action-id="${escapeHTML(action.id)}"><button class="action-check ${completeAction ? 'complete' : ''}" data-toggle-action title="${completeAction ? 'Rouvrir' : 'Marquer comme mise en œuvre'}">✓</button><div><div class="risk-card-head"><span class="badge badge-${action.priority === 'high' ? 'high' : action.priority === 'mid' ? 'mid' : 'low'}">${escapeHTML(action.priority === 'high' ? 'Haute' : action.priority === 'mid' ? 'Modérée' : 'Amélioration')}</span><h3>${escapeHTML(action.title)}</h3></div><p>${escapeHTML(action.description || action.objective || 'Conditions d’exécution à préciser.')}</p><div class="action-details"><span>${escapeHTML(unit?.name || 'Sans unité')}</span><span>${escapeHTML(action.owner || 'Responsable à attribuer')}</span><span>Échéance ${escapeHTML(formatDate(action.deadline))}</span><span>${Number(action.budget || 0).toLocaleString('fr-FR')} €</span>${risk ? `<span>Risque : ${escapeHTML(risk.title)}</span>` : ''}</div></div><div class="action-side"><select data-inline-action-status aria-label="Statut">${ACTION_STATUSES.map(status => `<option ${status === action.status ? 'selected' : ''}>${escapeHTML(status)}</option>`).join('')}</select><input type="date" data-inline-action-date value="${escapeHTML(action.deadline || '')}" aria-label="Échéance"><button class="row-button" data-edit-action="${escapeHTML(action.id)}">Modifier la fiche</button></div></article>`;
    }).join('') : '<div class="empty-state">Aucune action ne correspond aux filtres.</div>';

    $('#action-list').querySelectorAll('[data-edit-action]').forEach(button => button.addEventListener('click', () => openActionModal(button.dataset.editAction)));
  }

  function priorityOrder(priority) { return ({ high: 0, mid: 1, low: 2 })[priority] ?? 3; }

  function reviewChecks() {
    const progress = globalProgress();
    const unvalidated = state.risks.filter(risk => risk.validation !== 'validated');
    const uncertain = state.risks.filter(risk => risk.confidence === 'low');
    const highMissing = highRisksWithoutAction();
    const incompleteActions = state.actions.filter(action => !action.owner || !action.deadline);
    const papripactIncomplete = Number(state.company.employees) >= 50 ? state.actions.filter(action => !action.indicator || action.budget === '' || action.budget === null || !action.resource) : [];
    const checks = [
      { id: 'company', severity: state.company.name && Number(state.company.employees) > 0 ? 'ok' : 'block', title: 'Identité et effectif de l’établissement', detail: state.company.name && Number(state.company.employees) > 0 ? 'Informations principales renseignées.' : 'Renseignez la raison sociale et l’effectif.' },
      { id: 'units', severity: state.units.length ? 'ok' : 'block', title: 'Unités de travail', detail: state.units.length ? `${plural(state.units.length, 'unité')} décrite${state.units.length > 1 ? 's' : ''}.` : 'Créez au moins une unité de travail.' },
      { id: 'assessment', severity: progress.remaining === 0 ? 'ok' : 'block', title: 'Évaluation complète', detail: progress.remaining === 0 ? 'Toutes les questions ont une réponse.' : `${progress.remaining} question${progress.remaining > 1 ? 's' : ''} reste${progress.remaining > 1 ? 'nt' : ''} sans réponse.` },
      { id: 'uncertainty', severity: uncertain.length ? 'block' : 'ok', title: 'Informations incertaines', detail: uncertain.length ? `${uncertain.length} fiche${uncertain.length > 1 ? 's' : ''} comporte${uncertain.length > 1 ? 'nt' : ''} une information à clarifier.` : 'Aucune réponse incertaine non traitée.' },
      { id: 'validation', severity: unvalidated.length ? 'block' : 'ok', title: 'Validation humaine des risques', detail: unvalidated.length ? `${unvalidated.length} risque${unvalidated.length > 1 ? 's' : ''} à relire et valider.` : 'Toutes les fiches de risque sont validées.' },
      { id: 'high-actions', severity: highMissing.length ? 'block' : 'ok', title: 'Risques élevés couverts par une action', detail: highMissing.length ? `${highMissing.length} risque${highMissing.length > 1 ? 's élevés restent' : ' élevé reste'} sans action suffisante.` : 'Chaque risque élevé est associé à une action.' },
      { id: 'action-fields', severity: incompleteActions.length ? 'block' : 'ok', title: 'Responsables et échéances', detail: incompleteActions.length ? `${incompleteActions.length} action${incompleteActions.length > 1 ? 's sont' : ' est'} incomplète${incompleteActions.length > 1 ? 's' : ''}.` : 'Toutes les actions ont un responsable et une échéance.' },
      { id: 'papripact', severity: papripactIncomplete.length ? 'block' : 'ok', title: Number(state.company.employees) >= 50 ? 'Contenu du PAPRIPACT' : 'Liste d’actions adaptée à l’effectif', detail: papripactIncomplete.length ? `${papripactIncomplete.length} action${papripactIncomplete.length > 1 ? 's nécessitent' : ' nécessite'} budget, ressource et indicateur.` : Number(state.company.employees) >= 50 ? 'Les actions comportent les champs structurants du programme annuel.' : 'La liste d’actions est intégrée à la démarche.' },
      { id: 'employees', severity: state.review.employeesInvolved ? 'ok' : 'block', title: 'Participation des salariés', detail: state.review.employeesInvolved ? 'Participation déclarée.' : 'Confirmez l’association ou le recueil des observations des salariés.' },
      { id: 'cse', severity: state.company.cse !== 'yes' || state.review.cseConsulted ? 'ok' : 'block', title: 'Association du CSE', detail: state.company.cse !== 'yes' ? 'Aucun CSE déclaré dans cet établissement.' : state.review.cseConsulted ? 'Consultation déclarée.' : 'Confirmez l’association et la consultation du CSE.' },
      { id: 'declaration', severity: state.review.employerDeclaration && state.review.author ? 'ok' : 'block', title: 'Validation de l’employeur', detail: state.review.employerDeclaration && state.review.author ? `Déclaration préparée par ${state.review.author}.` : 'Renseignez le validateur et cochez la déclaration finale.' }
    ];
    return checks;
  }

  function renderReview() {
    const checks = reviewChecks();
    const blocks = checks.filter(check => check.severity === 'block').length;
    const badge = $('#review-status-badge');
    badge.className = `badge ${blocks ? 'badge-high' : 'badge-low'}`;
    badge.textContent = blocks ? `${blocks} blocage${blocks > 1 ? 's' : ''}` : 'Prêt à archiver';
    $('#review-checks').innerHTML = checks.map(check => `<article class="review-check ${check.severity}"><span class="review-icon">${check.severity === 'ok' ? '✓' : '!'}</span><div><strong>${escapeHTML(check.title)}</strong><p>${escapeHTML(check.detail)}</p></div></article>`).join('');
    $$('[data-review]').forEach(input => {
      input.checked = Boolean(state.review[input.dataset.review]);
      if (input.dataset.review === 'cseConsulted') input.closest('label').hidden = state.company.cse !== 'yes';
    });
    $('#review-author').value = state.review.author || '';
    const button = $('#create-version-from-review');
    button.disabled = blocks > 0;
    $('#version-block-note').textContent = blocks ? 'Corrigez les points bloquants pour créer une archive.' : 'Tous les contrôles bloquants sont satisfaits.';
  }

  function renderVersions() {
    $('#version-count').textContent = plural(state.versions.length, 'version');
    $('#version-list').innerHTML = state.versions.length ? state.versions.slice().reverse().map((version, index) => `<article class="version-card ${index === 0 ? 'current' : ''}"><div class="version-card-head"><div><h3>Version ${escapeHTML(version.number)} · ${escapeHTML(version.label || version.reason)}</h3><p>${escapeHTML(version.reason)} — ${escapeHTML(version.author)}</p></div><span class="badge ${index === 0 ? 'badge-info' : 'badge-low'}">${escapeHTML(formatDate(version.date))}</span></div><div class="version-meta"><span>${version.summary?.units || 0} unités</span><span>${version.summary?.risks || 0} risques</span><span>${version.summary?.high || 0} élevés</span><span>${version.summary?.actions || 0} actions</span><span>Empreinte ${escapeHTML(version.hash || '')}</span></div><div class="version-actions"><button class="btn btn-light btn-sm" data-download-version="${escapeHTML(version.id)}">Télécharger JSON</button><button class="btn btn-light btn-sm" data-print-version="${escapeHTML(version.id)}">Imprimer</button></div></article>`).join('') : '<div class="empty-state">Aucune version archivée. Terminez la revue finale pour créer la première version.</div>';
    $('#version-list').querySelectorAll('[data-download-version]').forEach(button => button.addEventListener('click', () => downloadVersion(button.dataset.downloadVersion)));
    $('#version-list').querySelectorAll('[data-print-version]').forEach(button => button.addEventListener('click', () => printVersion(button.dataset.printVersion)));

    $('#event-list').innerHTML = state.events.length ? state.events.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(event => `<article class="timeline-item"><span class="timeline-dot ${event.status === 'closed' ? 'closed' : ''}"></span><div class="timeline-copy"><strong>${escapeHTML(event.type)} · ${escapeHTML(formatDate(event.date))}</strong><p>${escapeHTML(event.description)}${event.unitId ? ` · ${escapeHTML(unitById(event.unitId)?.name || 'Unité supprimée')}` : ''}</p><button class="row-button" data-event-status="${escapeHTML(event.id)}">${event.status === 'open' ? 'Marquer analysé' : event.status === 'reviewed' ? 'Clôturer' : 'Rouvrir'}</button></div></article>`).join('') : '<div class="empty-state">Aucun événement enregistré.</div>';
    $('#event-list').querySelectorAll('[data-event-status]').forEach(button => button.addEventListener('click', () => advanceEvent(button.dataset.eventStatus)));
  }

  function renderPrintDocument(snapshot) {
    const company = snapshot.company || {};
    const risksByUnit = (snapshot.units || []).map(unit => ({ unit, risks: (snapshot.risks || []).filter(risk => risk.unitId === unit.id) }));
    const programLabel = Number(company.employees) >= 50 ? 'Programme annuel de prévention (PAPRIPACT)' : 'Liste des actions de prévention';
    $('#print-document').innerHTML = `<article class="print-cover"><div><div class="print-brand">Prévio</div><h1>Document unique d’évaluation des risques professionnels</h1></div><div class="print-cover-meta"><div><strong>${escapeHTML(company.name || 'Entreprise')}</strong><br>${escapeHTML(company.address || '')}<br>SIRET : ${escapeHTML(company.siret || 'Non renseigné')}</div><div>Effectif : ${escapeHTML(company.employees || 0)} salariés<br>Version générée : ${escapeHTML(formatDate((snapshot.generatedAt || todayISO()).slice(0, 10)))}<br>Pilote : ${escapeHTML(company.contactName || '')}</div></div></article><article class="print-page"><h2>1. Méthode et périmètre</h2><p>L’évaluation est structurée par unité de travail. La cotation résiduelle combine gravité, exposition et niveau de maîtrise déclaré. Elle sert à prioriser et doit être relue au regard du travail réel.</p><h3>Unités de travail</h3><table class="print-table"><thead><tr><th>Unité</th><th>Personnes</th><th>Lieu</th><th>Activités</th></tr></thead><tbody>${(snapshot.units || []).map(unit => `<tr><td>${escapeHTML(unit.name)}</td><td>${unit.people}</td><td>${escapeHTML(unit.place)}</td><td>${escapeHTML(unit.tasks)}</td></tr>`).join('')}</tbody></table><div class="print-footer">Document de travail généré par Prévio. La validation finale relève de l’employeur après participation des salariés et consultation des instances applicables.</div></article>${risksByUnit.map(group => `<article class="print-page"><h2>2. ${escapeHTML(group.unit.name)}</h2>${group.risks.length ? group.risks.map(risk => { const score = calculateScore(risk.severity, risk.frequency, risk.control); return `<section class="print-risk"><h3>${escapeHTML(risk.title)} — ${escapeHTML(riskLevelLabel(riskLevel(risk)))}</h3><dl><dt>Situation</dt><dd>${escapeHTML(risk.situation)}</dd><dt>Danger</dt><dd>${escapeHTML(risk.danger)}</dd><dt>Personnes exposées</dt><dd>${escapeHTML(risk.exposed)}</dd><dt>Cotation</dt><dd>G ${risk.severity} × E ${risk.frequency} × M ${score.factor} = ${score.residual}</dd><dt>Mesures existantes</dt><dd>${escapeHTML(risk.existingMeasures || 'À préciser')}</dd><dt>Mesures proposées</dt><dd>${escapeHTML(risk.prevention || 'À préciser').replace(/\n/g, '<br>')}</dd><dt>Source</dt><dd>${escapeHTML(risk.source?.label || '')}</dd></dl></section>`; }).join('') : '<p>Aucun risque retenu pour cette unité.</p>'}<div class="print-footer">Unité : ${escapeHTML(group.unit.name)} · ${group.risks.length} risque${group.risks.length > 1 ? 's' : ''}</div></article>`).join('')}<article class="print-page"><h2>3. ${escapeHTML(programLabel)}</h2><table class="print-table"><thead><tr><th>Action</th><th>Risque / unité</th><th>Responsable</th><th>Échéance</th><th>Indicateur</th><th>Statut</th></tr></thead><tbody>${(snapshot.actions || []).map(action => { const risk = (snapshot.risks || []).find(item => item.id === action.riskId); const unit = (snapshot.units || []).find(item => item.id === action.unitId); return `<tr><td><strong>${escapeHTML(action.title)}</strong><br>${escapeHTML(action.description || '')}</td><td>${escapeHTML(risk?.title || '')}<br>${escapeHTML(unit?.name || '')}</td><td>${escapeHTML(action.owner || '')}</td><td>${escapeHTML(formatDate(action.deadline))}</td><td>${escapeHTML(action.indicator || '')}</td><td>${escapeHTML(action.status)}</td></tr>`; }).join('')}</tbody></table><div class="print-footer">Les actions doivent être suivies, leur efficacité vérifiée et la cotation réévaluée si nécessaire.</div></article>`;
  }

  function renderOnboarding() {
    const packSelect = $('#ob-sector');
    renderSectorOptions(packSelect, packSelect.value || state.company.sectorId);
    if (!packSelect.dataset.initialized) {
      packSelect.value = state.company.sectorId;
      packSelect.dataset.initialized = 'true';
    }
    const selectedPack = DATA.SECTOR_PACKS[packSelect.value] || DATA.SECTOR_PACKS.generic;
    $('#ob-sector-description').textContent = selectedPack.description;
    $$('[data-onboard-panel]').forEach(panel => { panel.hidden = Number(panel.dataset.onboardPanel) !== onboardingStep; });
    $$('[data-onboard-indicator]').forEach(indicator => {
      const step = Number(indicator.dataset.onboardIndicator);
      indicator.classList.toggle('active', step === onboardingStep);
      indicator.classList.toggle('done', step < onboardingStep);
    });
    $('#onboard-prev').hidden = onboardingStep === 1;
    $('#onboard-note').textContent = `Étape ${onboardingStep} sur 4`;
    $('#onboard-next').innerHTML = onboardingStep === 4 ? 'Créer mon espace <span class="arrow">→</span>' : 'Continuer <span class="arrow">→</span>';
    if (onboardingStep === 3) renderOnboardingUnitPicks();
    if (onboardingStep === 4) renderOnboardingSummary();
  }

  function initializeOnboardingInputs() {
    $('#ob-company-name').value = state.company.name || '';
    $('#ob-siret').value = state.company.siret || '';
    renderSectorOptions($('#ob-sector'), state.company.sectorId);
    $('#ob-employees').value = state.company.employees || 1;
    $('#ob-naf').value = state.company.naf || '';
    $('#ob-address').value = state.company.address || '';
    $('#ob-contact-name').value = state.company.contactName || '';
    $('#ob-contact-role').value = state.company.contactRole || 'Dirigeant·e';
    $('#ob-email').value = state.company.email || '';
    $('#ob-spst').value = state.company.spst || '';
    $('#ob-cse').value = state.company.cse || 'no';
    $('#ob-last-review').value = state.company.lastReviewDate || '';
    onboardingSelection = new Set((DATA.SECTOR_PACKS[state.company.sectorId]?.units || []).map(unit => unit.key));
    $('#ob-sector-description').textContent = DATA.SECTOR_PACKS[state.company.sectorId]?.description || '';
  }

  function renderOnboardingUnitPicks() {
    const pack = DATA.SECTOR_PACKS[$('#ob-sector').value] || DATA.SECTOR_PACKS.generic;
    if (![...onboardingSelection].some(key => pack.units.some(unit => unit.key === key))) onboardingSelection = new Set(pack.units.map(unit => unit.key));
    $('#onboard-unit-picks').innerHTML = pack.units.map(unit => `<button class="unit-pick" type="button" aria-pressed="${onboardingSelection.has(unit.key)}" data-onboard-unit="${escapeHTML(unit.key)}"><span class="unit-icon">${escapeHTML(unit.icon)}</span><span><b>${escapeHTML(unit.name)}</b><small>${escapeHTML(unit.tasks)}</small></span><span class="pick-check">✓</span></button>`).join('');
    $('#onboard-unit-picks').querySelectorAll('[data-onboard-unit]').forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.onboardUnit;
      if (onboardingSelection.has(key)) onboardingSelection.delete(key); else onboardingSelection.add(key);
      button.setAttribute('aria-pressed', String(onboardingSelection.has(key)));
    }));
  }

  function readOnboardingCompany() {
    state.company.name = $('#ob-company-name').value.trim();
    state.company.siret = $('#ob-siret').value.trim();
    state.company.sectorId = $('#ob-sector').value;
    state.company.employees = Number($('#ob-employees').value) || 1;
    state.company.naf = $('#ob-naf').value.trim();
    state.company.address = $('#ob-address').value.trim();
    state.company.contactName = $('#ob-contact-name').value.trim();
    state.company.contactRole = $('#ob-contact-role').value;
    state.company.email = $('#ob-email').value.trim();
    state.company.spst = $('#ob-spst').value.trim();
    state.company.cse = $('#ob-cse').value;
    state.company.lastReviewDate = $('#ob-last-review').value;
  }

  function renderOnboardingSummary() {
    readOnboardingCompany();
    const pack = DATA.SECTOR_PACKS[state.company.sectorId] || DATA.SECTOR_PACKS.generic;
    $('#onboard-summary').innerHTML = `<div class="summary-row"><span>Entreprise</span><strong>${escapeHTML(state.company.name || 'À renseigner')}</strong></div><div class="summary-row"><span>Effectif</span><strong>${plural(Number(state.company.employees) || 0, 'salarié')}</strong></div><div class="summary-row"><span>Pack métier</span><strong>${escapeHTML(pack.label)}</strong></div><div class="summary-row"><span>Unités sélectionnées</span><strong>${plural(onboardingSelection.size, 'unité')}</strong></div><div class="summary-row"><span>Sortie attendue</span><strong>${escapeHTML(Number(state.company.employees) >= 50 ? 'DUERP + PAPRIPACT' : 'DUERP + liste d’actions')}</strong></div>`;
  }

  function validateSiret(input, report = false) {
    if (!input) return true;
    input.value = input.value.replace(/\D/g, '').slice(0, 14);
    const valid = !input.value || /^\d{14}$/.test(input.value);
    input.setCustomValidity(valid ? '' : 'Le SIRET doit comporter exactement 14 chiffres.');
    input.setAttribute('aria-invalid', String(!valid));
    const error = input.getAttribute('aria-describedby') ? $(`#${input.getAttribute('aria-describedby')}`) : null;
    if (error) error.textContent = valid ? '' : 'Le SIRET doit comporter exactement 14 chiffres.';
    if (report && !valid) input.reportValidity();
    return valid;
  }

  function validateEmail(input, report = false) {
    if (!input) return true;
    const valid = !input.value || input.checkValidity();
    input.setAttribute('aria-invalid', String(!valid));
    const error = input.getAttribute('aria-describedby') ? $(`#${input.getAttribute('aria-describedby')}`) : null;
    if (error) error.textContent = valid ? '' : 'Saisissez une adresse e-mail valide.';
    if (report && !valid) input.reportValidity();
    return valid;
  }

  function advanceOnboarding() {
    if (onboardingStep === 1) {
      const name = $('#ob-company-name');
      const employees = $('#ob-employees');
      if (!name.value.trim()) { name.reportValidity(); return; }
      if (!employees.checkValidity()) { employees.reportValidity(); return; }
      if (!validateSiret($('#ob-siret'), true)) return;
    }
    if (onboardingStep === 2) {
      if (!$('#ob-contact-name').value.trim()) { $('#ob-contact-name').reportValidity(); return; }
      if (!validateEmail($('#ob-email'), true) || !$('#ob-email').value.trim()) { $('#ob-email').reportValidity(); return; }
    }
    if (onboardingStep === 3 && onboardingSelection.size === 0) { toast('Sélectionnez au moins une unité de travail.'); return; }
    if (onboardingStep < 4) {
      onboardingStep += 1;
      renderOnboarding();
      return;
    }
    if (!$('#ob-declaration').checked) { toast('Confirmez le cadre de la démarche pour continuer.'); return; }
    readOnboardingCompany();
    const pack = DATA.SECTOR_PACKS[state.company.sectorId] || DATA.SECTOR_PACKS.generic;
    state.units = pack.units.filter(template => onboardingSelection.has(template.key)).map(template => makeUnit(template, pack.id, `-${Math.random().toString(36).slice(2, 5)}`));
    state.assessments = {};
    state.risks = [];
    state.actions = [];
    state.events = [];
    state.versions = [];
    state.review = { employeesInvolved: false, cseConsulted: false, spstShared: false, employerDeclaration: false, author: state.company.contactName, lastValidatedAt: null };
    state.units.forEach(unit => assessmentFor(unit.id));
    state.ui.onboardingCompleted = true;
    state.ui.activeUnitId = state.units[0]?.id || '';
    state.ui.questionIndexByUnit = {};
    saveState('Votre espace Prévio est prêt.', 'onboarding');
    renderAll();
    gotoApp('dashboard');
  }

  function saveCompany() {
    if (!validateSiret($('#company-siret'), true) || !validateEmail($('#company-email'), true)) return;
    $$('[data-company]').forEach(input => {
      const key = input.dataset.company;
      state.company[key] = key === 'employees' ? Number(input.value) || 1 : input.value.trim?.() ?? input.value;
    });
    if (!DATA.SECTOR_PACKS[state.company.sectorId]) state.company.sectorId = 'generic';
    saveState('Informations de l’entreprise enregistrées.', 'company');
    renderAll();
  }

  function suggestUnitsFromPack() {
    const pack = DATA.SECTOR_PACKS[state.company.sectorId] || DATA.SECTOR_PACKS.generic;
    let added = 0;
    pack.units.forEach(template => {
      const exists = state.units.some(unit => unit.templateKey === template.key && unit.packId === pack.id) || state.units.some(unit => unit.name.toLowerCase() === template.name.toLowerCase());
      if (!exists) {
        const suffix = `-${Math.random().toString(36).slice(2, 5)}`;
        const unit = makeUnit(template, pack.id, suffix);
        state.units.push(unit);
        assessmentFor(unit.id);
        added += 1;
      }
    });
    if (!added) { toast('Toutes les unités suggérées sont déjà présentes.'); return; }
    saveState(`${added} unité${added > 1 ? 's' : ''} suggérée${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}.`, 'unit');
    renderAll();
  }

  function openUnitModal(unitId = '') {
    const unit = unitById(unitId);
    $('#unit-edit-id').value = unit?.id || '';
    $('#unit-name').value = unit?.name || '';
    $('#unit-people').value = unit?.people || 1;
    $('#unit-place').value = unit?.place || '';
    $('#unit-tasks').value = unit?.tasks || '';
    $('#unit-question-set').value = unit?.packId === 'generic' ? 'generic' : 'sector';
    $('#modal-unit-title').textContent = unit ? 'Modifier l’unité de travail' : 'Ajouter une unité de travail';
    openModal('unit');
  }

  function saveUnit(event) {
    event.preventDefault();
    const id = $('#unit-edit-id').value;
    const existing = unitById(id);
    const name = $('#unit-name').value.trim();
    if (!name) return;
    const people = Math.max(1, Number($('#unit-people').value) || 1);
    const place = $('#unit-place').value.trim();
    const tasks = $('#unit-tasks').value.trim();
    const questionSet = $('#unit-question-set').value;
    const pack = DATA.SECTOR_PACKS[state.company.sectorId] || DATA.SECTOR_PACKS.generic;
    const suggestedTemplate = pack.units.find(template => template.name.toLowerCase() === name.toLowerCase()) || pack.units[0];
    const questionIds = questionSet === 'generic' ? clone(DATA.SECTOR_PACKS.generic.units[0].questions) : clone(suggestedTemplate?.questions || DATA.SECTOR_PACKS.generic.units[0].questions);
    if (existing) {
      Object.assign(existing, { name, people, place, tasks, questionIds, updatedAt: nowISO() });
    } else {
      let unitId = `unit-custom-${slug(name)}`;
      while (unitById(unitId)) unitId = uid(unitId);
      const unit = { id: unitId, templateKey: '', packId: questionSet === 'generic' ? 'generic' : state.company.sectorId, name, icon: '◇', people, place, tasks, questionIds, createdAt: nowISO(), updatedAt: nowISO() };
      state.units.push(unit);
      assessmentFor(unit.id);
      if (!state.ui.activeUnitId) state.ui.activeUnitId = unit.id;
    }
    saveState(existing ? 'Unité de travail modifiée.' : 'Unité de travail ajoutée.', 'unit');
    closeModal();
    renderAll();
  }

  function deleteUnit(unitId) {
    const unit = unitById(unitId);
    if (!unit) return;
    if (state.units.length <= 1) { toast('Conservez au moins une unité de travail.'); return; }
    if (!window.confirm(`Supprimer l’unité « ${unit.name} » et les réponses associées ? Les risques et actions seront conservés sans unité.`)) return;
    state.units = state.units.filter(item => item.id !== unitId);
    delete state.assessments[unitId];
    state.risks.forEach(risk => { if (risk.unitId === unitId) risk.unitId = ''; });
    state.actions.forEach(action => { if (action.unitId === unitId) action.unitId = ''; });
    if (state.ui.activeUnitId === unitId) state.ui.activeUnitId = state.units[0].id;
    saveState('Unité supprimée. Les fiches associées restent dans le registre à reclasser.', 'unit');
    renderAll();
  }

  function fillUnitSelects() {
    const options = `<option value="">Sans unité</option>${state.units.map(unit => `<option value="${escapeHTML(unit.id)}">${escapeHTML(unit.name)}</option>`).join('')}`;
    ['#risk-unit', '#action-unit', '#event-unit'].forEach(selector => { const select = $(selector); if (select) select.innerHTML = options; });
  }

  function updateRiskScorePreview() {
    const severity = Number($('#risk-severity').value || 0);
    const frequency = Number($('#risk-frequency').value || 0);
    const control = Number($('#risk-control').value || 0);
    const score = calculateScore(severity, frequency, control);
    const pseudo = { severity, frequency, control, confidence: $('#risk-confidence').value };
    $('#risk-score-preview').textContent = `${score.residual} — ${riskLevelLabel(riskLevel(pseudo))}`;
    $('#risk-formula-box').innerHTML = `<strong>${severity} × ${frequency} = ${score.gross}</strong> (criticité brute)<br>${score.gross} × ${score.factor} = <strong>${score.residual}</strong> (criticité résiduelle).`;
  }

  function openRiskModal(riskId = '') {
    fillUnitSelects();
    const risk = riskById(riskId);
    $('#risk-id').value = risk?.id || '';
    $('#risk-title').value = risk?.title || '';
    $('#risk-unit').value = risk?.unitId || state.units[0]?.id || '';
    $('#risk-exposed').value = risk?.exposed || '';
    $('#risk-danger').value = risk?.danger || '';
    $('#risk-circumstances').value = risk?.circumstances || '';
    $('#risk-situation').value = risk?.situation || '';
    $('#risk-severity').value = risk?.severity || 2;
    $('#risk-frequency').value = risk?.frequency || 2;
    $('#risk-control').value = risk?.control || 3;
    $('#risk-existing').value = risk?.existingMeasures || '';
    $('#risk-prevention').value = risk?.prevention || '';
    $('#risk-confidence').value = risk?.confidence || 'medium';
    $('#risk-validation').value = risk?.validation || 'to-review';
    $('#risk-source-label').value = risk?.source?.label || DATA.SOURCES.duerp.label;
    $('#risk-source-url').value = risk?.source?.url || DATA.SOURCES.duerp.url;
    $('#delete-risk').hidden = !risk;
    updateRiskScorePreview();
    openModal('risk');
  }

  function saveRisk(event) {
    event.preventDefault();
    const id = $('#risk-id').value || uid('risk-manual');
    const existingIndex = state.risks.findIndex(risk => risk.id === id);
    const risk = {
      id,
      origin: existingIndex >= 0 ? state.risks[existingIndex].origin : 'manual',
      unitId: $('#risk-unit').value,
      sourceQuestionId: existingIndex >= 0 ? state.risks[existingIndex].sourceQuestionId || '' : '',
      title: $('#risk-title').value.trim(), danger: $('#risk-danger').value.trim(), situation: $('#risk-situation').value.trim(),
      exposed: $('#risk-exposed').value.trim(), circumstances: $('#risk-circumstances').value.trim(),
      severity: Number($('#risk-severity').value), frequency: Number($('#risk-frequency').value), control: Number($('#risk-control').value),
      existingMeasures: $('#risk-existing').value.trim(), prevention: $('#risk-prevention').value.trim(), confidence: $('#risk-confidence').value,
      validation: $('#risk-validation').value, source: { label: $('#risk-source-label').value.trim(), url: $('#risk-source-url').value.trim() },
      specialist: existingIndex >= 0 ? state.risks[existingIndex].specialist || '' : '',
      aiTrace: existingIndex >= 0 ? state.risks[existingIndex].aiTrace || null : null,
      updatedAt: nowISO()
    };
    if (existingIndex >= 0) state.risks[existingIndex] = risk; else state.risks.push(risk);
    saveState(existingIndex >= 0 ? 'Fiche de risque mise à jour.' : 'Risque ajouté au registre.', 'risk');
    closeModal();
    renderAll();
  }

  function deleteRisk() {
    const id = $('#risk-id').value;
    if (!id || !window.confirm('Supprimer cette fiche de risque ? Les actions associées seront conservées sans lien.')) return;
    state.risks = state.risks.filter(risk => risk.id !== id);
    state.actions.forEach(action => { if (action.riskId === id) action.riskId = ''; });
    saveState('Risque supprimé.', 'risk');
    closeModal();
    renderAll();
  }

  function fillActionRiskSelect(selected = '') {
    const select = $('#action-risk');
    select.innerHTML = `<option value="">Sans risque associé</option>${state.risks.map(risk => `<option value="${escapeHTML(risk.id)}">${escapeHTML(risk.title)} — ${escapeHTML(unitById(risk.unitId)?.name || 'Sans unité')}</option>`).join('')}`;
    select.value = selected;
  }

  function openActionModal(actionId = '', riskId = '') {
    fillUnitSelects();
    const action = actionById(actionId);
    const risk = riskById(riskId || action?.riskId);
    fillActionRiskSelect(action?.riskId || risk?.id || '');
    $('#action-id').value = action?.id || '';
    $('#action-title').value = action?.title || (risk ? `Mettre en œuvre une mesure pour : ${risk.title}` : '');
    $('#action-risk').value = action?.riskId || risk?.id || '';
    $('#action-unit').value = action?.unitId || risk?.unitId || state.units[0]?.id || '';
    $('#action-objective').value = action?.objective || (risk ? `Réduire la criticité du risque « ${risk.title} »` : '');
    $('#action-description').value = action?.description || (risk?.prevention ? risk.prevention.split('\n')[0] : '');
    $('#action-priority').value = action?.priority || (risk && riskLevel(risk) === 'high' ? 'high' : 'mid');
    $('#action-status').value = action?.status || 'À étudier';
    $('#action-owner').value = action?.owner || '';
    $('#action-deadline').value = action?.deadline || '';
    $('#action-budget').value = action?.budget ?? '';
    $('#action-resource').value = action?.resource || '';
    $('#action-indicator').value = action?.indicator || '';
    $('#action-evidence').value = action?.evidence || '';
    $('#action-effectiveness').value = action?.effectiveness || 'not-checked';
    $('#action-verified-at').value = action?.verifiedAt || '';
    $('#delete-action').hidden = !action;
    openModal('action');
  }

  function saveAction(event) {
    event.preventDefault();
    const id = $('#action-id').value || uid('action');
    const existingIndex = state.actions.findIndex(action => action.id === id);
    const action = {
      id, riskId: $('#action-risk').value, unitId: $('#action-unit').value, title: $('#action-title').value.trim(), objective: $('#action-objective').value.trim(),
      description: $('#action-description').value.trim(), priority: $('#action-priority').value, status: $('#action-status').value, owner: $('#action-owner').value.trim(),
      deadline: $('#action-deadline').value, budget: $('#action-budget').value === '' ? '' : Number($('#action-budget').value), resource: $('#action-resource').value.trim(),
      indicator: $('#action-indicator').value.trim(), evidence: $('#action-evidence').value.trim(), effectiveness: $('#action-effectiveness').value,
      verifiedAt: $('#action-verified-at').value, createdAt: existingIndex >= 0 ? state.actions[existingIndex].createdAt : nowISO(), updatedAt: nowISO()
    };
    if (existingIndex >= 0) state.actions[existingIndex] = action; else state.actions.push(action);
    saveState(existingIndex >= 0 ? 'Action mise à jour.' : 'Action ajoutée au plan.', 'action');
    closeModal();
    renderAll();
  }

  function deleteAction() {
    const id = $('#action-id').value;
    if (!id || !window.confirm('Supprimer cette action de prévention ?')) return;
    state.actions = state.actions.filter(action => action.id !== id);
    saveState('Action supprimée.', 'action');
    closeModal();
    renderAll();
  }

  function saveCollaborator(event) {
    event.preventDefault();
    state.collaborators.push({ id: uid('collaborator'), name: $('#collaborator-name').value.trim(), email: $('#collaborator-email').value.trim(), role: $('#collaborator-role').value, scope: $('#collaborator-scope').value, status: 'Invitation à envoyer' });
    saveState('Participant ajouté à la démarche.', 'collaboration');
    event.target.reset();
    closeModal();
    renderAll();
  }

  function saveEvent(event) {
    event.preventDefault();
    state.events.unshift({ id: uid('event'), type: $('#event-type').value, date: $('#event-date').value || todayISO(), unitId: $('#event-unit').value, description: $('#event-description').value.trim(), status: $('#event-status').value, createdAt: nowISO() });
    saveState('Changement ajouté au journal.', 'event');
    event.target.reset();
    closeModal();
    renderAll();
  }

  function advanceEvent(eventId) {
    const event = state.events.find(item => item.id === eventId);
    if (!event) return;
    event.status = event.status === 'open' ? 'reviewed' : event.status === 'reviewed' ? 'closed' : 'open';
    saveState('Statut du changement mis à jour.', 'event');
    renderAll();
  }

  function createVersion(event) {
    event.preventDefault();
    const checks = reviewChecks();
    if (checks.some(check => check.severity === 'block')) { toast('La revue finale comporte encore des points bloquants.'); return; }
    const snapshot = buildSnapshot(state);
    const version = {
      id: uid('version'), number: state.versions.length + 1, label: 'Version validée', date: $('#version-date').value || todayISO(), author: $('#version-author').value.trim(),
      reason: $('#version-reason').value.trim(), createdAt: nowISO(), hash: hashString(JSON.stringify(snapshot)), summary: snapshotSummary(snapshot), snapshot
    };
    state.versions.push(version);
    state.review.lastValidatedAt = version.createdAt;
    state.review.employerDeclaration = false;
    state.events.forEach(item => { if (item.status === 'reviewed') item.status = 'closed'; });
    saveState(`Version ${version.number} archivée.`, 'version');
    closeModal();
    renderAll();
    gotoApp('versions');
  }

  function downloadVersion(id) {
    const version = state.versions.find(item => item.id === id);
    if (!version) return;
    download(`previo-duerp-version-${version.number}.json`, JSON.stringify(version, null, 2), 'application/json');
    toast('Archive téléchargée.');
  }

  function printVersion(id) {
    const version = state.versions.find(item => item.id === id);
    if (!version) return;
    renderPrintDocument(version.snapshot);
    window.print();
    setTimeout(() => renderPrintDocument(buildSnapshot(state)), 300);
  }

  function risksCSV() {
    const rows = [['Unité', 'Risque', 'Danger', 'Situation', 'Exposés', 'Gravité', 'Exposition', 'Maîtrise', 'Score résiduel', 'Niveau', 'Mesures existantes', 'Mesures proposées', 'Validation', 'Source']];
    state.risks.forEach(risk => {
      const score = calculateScore(risk.severity, risk.frequency, risk.control);
      rows.push([unitById(risk.unitId)?.name || '', risk.title, risk.danger, risk.situation, risk.exposed, risk.severity, risk.frequency, risk.control, score.residual, riskLevelLabel(riskLevel(risk)), risk.existingMeasures, risk.prevention, risk.validation, risk.source?.label || '']);
    });
    return rowsToCSV(rows);
  }

  function actionsCSV() {
    const rows = [['Action', 'Risque', 'Unité', 'Objectif', 'Conditions d’exécution', 'Priorité', 'Responsable', 'Échéance', 'Budget', 'Ressource', 'Indicateur', 'Statut', 'Preuve', 'Efficacité']];
    state.actions.forEach(action => rows.push([action.title, riskById(action.riskId)?.title || '', unitById(action.unitId)?.name || '', action.objective, action.description, action.priority, action.owner, action.deadline, action.budget, action.resource, action.indicator, action.status, action.evidence, action.effectiveness]));
    return rowsToCSV(rows);
  }

  function rowsToCSV(rows) {
    return rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  }

  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        state = normalizeState(parsed);
        saveState('Sauvegarde importée.', 'import');
        initializeOnboardingInputs();
        renderAll();
      } catch (error) {
        console.error(error);
        toast('Le fichier ne contient pas une sauvegarde Prévio valide.');
      }
    };
    reader.readAsText(file);
  }

  function resetDemo() {
    if (!window.confirm('Réinitialiser toutes les données locales de cette démonstration ?')) return;
    state = createDefaultState();
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { storageAvailable = false; }
    saveState('Démonstration réinitialisée.', 'reset');
    initializeOnboardingInputs();
    closeModal();
    renderAll();
    gotoApp('dashboard');
  }

  function openModal(name) {
    const modal = $(`#modal-${name}`);
    if (!modal) return;
    closeModal(false);
    focusBeforeModal = document.activeElement;
    activeModal = modal;
    ['view-home', 'view-app'].forEach(id => {
      const view = $(`#${id}`);
      if (view) { view.inert = true; view.setAttribute('aria-hidden', 'true'); }
    });
    $$('.modal-backdrop').forEach(item => {
      if (item !== modal) { item.inert = true; item.setAttribute('aria-hidden', 'true'); }
    });
    modal.inert = false;
    modal.removeAttribute('aria-hidden');
    modal.classList.add('open');
    if (name === 'event') {
      fillUnitSelects();
      $('#event-date').value = todayISO();
    }
    if (name === 'version') {
      $('#version-author').value = state.review.author || state.company.contactName || '';
      $('#version-date').value = todayISO();
    }
    const focusable = modal.querySelector('input:not([type="hidden"]), textarea, select, button, [href]');
    const panel = modal.querySelector('.modal');
    if (!focusable && panel) panel.tabIndex = -1;
    const initialFocus = focusable || panel;
    initialFocus?.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (activeModal === modal && !modal.contains(document.activeElement)) initialFocus?.focus({ preventScroll: true });
    });
  }

  function closeModal(restoreFocus = true) {
    $$('.modal-backdrop.open').forEach(modal => modal.classList.remove('open'));
    ['view-home', 'view-app'].forEach(id => {
      const view = $(`#${id}`);
      if (view) { view.inert = false; view.removeAttribute('aria-hidden'); }
    });
    $$('.modal-backdrop').forEach(modal => { modal.inert = false; modal.setAttribute('aria-hidden', 'true'); });
    activeModal = null;
    if (restoreFocus && focusBeforeModal?.focus) focusBeforeModal.focus();
    focusBeforeModal = null;
  }

  function trapFocus(event) {
    if (!activeModal || event.key !== 'Tab') return;
    const elements = $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', activeModal).filter(element => element.offsetParent !== null);
    if (!elements.length) { event.preventDefault(); return; }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!activeModal.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function gotoApp(name) {
    activeView = name;
    state.ui.lastView = name;
    $('#view-home').classList.remove('is-active');
    $('#view-app').classList.add('is-active');
    $$('.appview').forEach(view => {
      const active = view.dataset.name === name;
      view.classList.toggle('is-active', active);
      view.hidden = !active;
    });
    if (name === 'quiz') quizDraftValue = null;
    renderAll();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function gotoHome() {
    $('#view-app').classList.remove('is-active');
    $('#view-home').classList.add('is-active');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function updateTabOverflow() {
    const tabs = $('#app-tabs');
    const hint = $('#tab-overflow-hint');
    if (!tabs || !hint) return;
    const overflow = tabs.scrollWidth > tabs.clientWidth + 4;
    const atEnd = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 8;
    hint.classList.toggle('visible', overflow && !atEnd);
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const goto = event.target.closest('[data-goto]');
      if (goto) {
        event.preventDefault();
        const target = goto.dataset.goto;
        if (target === 'home') gotoHome();
        else if (target === 'onboarding') { initializeOnboardingInputs(); onboardingStep = 1; renderOnboarding(); gotoApp('onboarding'); }
        else gotoApp(target);
        return;
      }
      const appGoto = event.target.closest('[data-appgoto]');
      if (appGoto) { event.preventDefault(); gotoApp(appGoto.dataset.appgoto); return; }
      const tab = event.target.closest('[data-appview]');
      if (tab) { gotoApp(tab.dataset.appview); return; }
      const modalButton = event.target.closest('[data-modal]');
      if (modalButton) {
        event.preventDefault();
        const name = modalButton.dataset.modal;
        if (name === 'unit') openUnitModal(); else if (name === 'risk') openRiskModal(); else if (name === 'action') openActionModal(); else openModal(name);
        return;
      }
      if (event.target.closest('[data-close-modal]') || (event.target.classList.contains('modal-backdrop'))) closeModal();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && activeModal) closeModal();
      trapFocus(event);
    });

    $('#burger')?.addEventListener('click', () => {
      const links = $('#nav-links');
      const open = !links.classList.contains('open');
      links.classList.toggle('open', open);
      $('#burger').setAttribute('aria-expanded', String(open));
    });

    $('#onboard-prev').addEventListener('click', () => { onboardingStep = Math.max(1, onboardingStep - 1); renderOnboarding(); });
    $('#onboard-next').addEventListener('click', advanceOnboarding);
    $('#ob-sector').addEventListener('change', () => {
      onboardingSelection = new Set((DATA.SECTOR_PACKS[$('#ob-sector').value] || DATA.SECTOR_PACKS.generic).units.map(unit => unit.key));
      $('#ob-sector-description').textContent = DATA.SECTOR_PACKS[$('#ob-sector').value]?.description || '';
      if (onboardingStep === 3) renderOnboardingUnitPicks();
    });
    ['#ob-siret', '#company-siret'].forEach(selector => $(selector)?.addEventListener('input', event => validateSiret(event.target)));
    ['#ob-email', '#company-email'].forEach(selector => $(selector)?.addEventListener('input', event => validateEmail(event.target)));

    $('#save-company').addEventListener('click', saveCompany);
    $('#suggest-units').addEventListener('click', suggestUnitsFromPack);
    $('#unit-form').addEventListener('submit', saveUnit);
    $('#risk-form').addEventListener('submit', saveRisk);
    $('#action-form').addEventListener('submit', saveAction);
    $('#event-form').addEventListener('submit', saveEvent);
    $('#collaborator-form').addEventListener('submit', saveCollaborator);
    $('#version-form').addEventListener('submit', createVersion);
    $('#delete-risk').addEventListener('click', deleteRisk);
    $('#delete-action').addEventListener('click', deleteAction);
    ['#risk-severity', '#risk-frequency', '#risk-control', '#risk-confidence'].forEach(selector => $(selector).addEventListener('change', updateRiskScorePreview));
    $('#action-risk').addEventListener('change', () => {
      const risk = riskById($('#action-risk').value);
      if (risk) $('#action-unit').value = risk.unitId;
    });

    $('#quiz-prev').addEventListener('click', () => saveQuizAnswerAndMove(-1));
    $('#quiz-next').addEventListener('click', () => saveQuizAnswerAndMove(1));

    $('#risk-search').addEventListener('input', event => { riskFilters.search = event.target.value.trim(); renderRisks(); });
    $('#risk-level-filter').addEventListener('change', event => { riskFilters.level = event.target.value; renderRisks(); });
    $('#risk-validation-filter').addEventListener('change', event => { riskFilters.validation = event.target.value; renderRisks(); });
    $('#action-search').addEventListener('input', event => { actionFilters.search = event.target.value.trim(); renderActions(); });
    $('#action-status-filter').addEventListener('change', event => { actionFilters.status = event.target.value; renderActions(); });
    $('#action-priority-filter').addEventListener('change', event => { actionFilters.priority = event.target.value; renderActions(); });

    $('#action-list').addEventListener('change', event => {
      const item = event.target.closest('[data-action-id]');
      if (!item) return;
      const action = actionById(item.dataset.actionId);
      if (!action) return;
      if (event.target.matches('[data-inline-action-status]')) action.status = event.target.value;
      if (event.target.matches('[data-inline-action-date]')) action.deadline = event.target.value;
      action.updatedAt = nowISO();
      saveState('Plan d’actions mis à jour.', 'action');
      renderAll();
    });
    $('#action-list').addEventListener('click', event => {
      const toggle = event.target.closest('[data-toggle-action]');
      if (!toggle) return;
      const item = toggle.closest('[data-action-id]');
      const action = actionById(item.dataset.actionId);
      if (!action) return;
      action.status = action.status === 'Vérifiée efficace' ? 'À revoir' : 'Mise en œuvre';
      action.updatedAt = nowISO();
      saveState('Statut de l’action mis à jour.', 'action');
      renderAll();
    });

    $$('[data-review]').forEach(input => input.addEventListener('change', () => {
      state.review[input.dataset.review] = input.checked;
      saveState('', 'review');
      renderReview();
    }));
    $('#review-author').addEventListener('input', event => { state.review.author = event.target.value.trim(); saveState('', 'review'); renderReview(); });
    $('#create-version-from-review').addEventListener('click', () => openModal('version'));

    $('#export-risks').addEventListener('click', () => { download('previo-registre-risques.csv', `\ufeff${risksCSV()}`, 'text/csv;charset=utf-8'); toast('Registre des risques exporté.'); });
    $('#export-actions').addEventListener('click', () => { download('previo-plan-actions.csv', `\ufeff${actionsCSV()}`, 'text/csv;charset=utf-8'); toast('Plan d’actions exporté.'); });
    $('#export-all-csv').addEventListener('click', () => { download('previo-risques-et-actions.csv', `\ufeff${risksCSV()}\n\n${actionsCSV()}`, 'text/csv;charset=utf-8'); toast('Export combiné téléchargé.'); });
    $('#download-backup').addEventListener('click', () => { download('previo-sauvegarde-complete.json', JSON.stringify(state, null, 2), 'application/json'); toast('Sauvegarde complète téléchargée.'); });
    $('#settings-download').addEventListener('click', () => $('#download-backup').click());
    $('#print-current').addEventListener('click', () => { renderPrintDocument(buildSnapshot(state)); window.print(); });
    $('#import-backup-button').addEventListener('click', () => $('#import-backup').click());
    $('#settings-import').addEventListener('click', () => { closeModal(); $('#import-backup').click(); });
    $('#import-backup').addEventListener('change', event => importBackup(event.target.files[0]));
    $('#settings-reset').addEventListener('click', resetDemo);

    $('#contact-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const name = $('#contact-name').value.trim();
      const email = $('#contact-email').value.trim();
      const message = $('#contact-message').value.trim();
      const content = `Demande Prévio\nNom : ${name}\nE-mail : ${email}\n\n${message}`;
      try {
        await navigator.clipboard.writeText(content);
        toast('Message copié dans le presse-papiers.');
      } catch {
        download('message-previo.txt', content, 'text/plain;charset=utf-8');
        toast('Message téléchargé au format texte.');
      }
      closeModal();
      event.target.reset();
    });

    $('#app-tabs').addEventListener('scroll', updateTabOverflow, { passive: true });
    window.addEventListener('resize', updateTabOverflow);
  }

  function loadPlausible() {
    const meta = $('meta[name="plausible-domain"]');
    const domain = meta?.content.trim();
    if (!domain) return;
    const script = document.createElement('script');
    script.defer = true;
    script.dataset.domain = domain;
    script.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(script);
  }

  initializeOnboardingInputs();
  bindEvents();
  renderOnboarding();
  renderAll();
  loadPlausible();
  window.__PREVIO__ = { getState: () => clone(state), calculateScore, riskLevel, reviewChecks, renderAll };
})();
