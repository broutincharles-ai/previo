(function () {
  'use strict';

  const SOURCES = {
    duerp: {
      label: 'Code du travail — DUERP par unité de travail',
      url: 'https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072050/LEGISCTA000023793886/'
    },
    bakery: {
      label: 'INRS — Boulangerie, pâtisserie : risques du métier',
      url: 'https://www.inrs.fr/metiers/commerce-service/boulangerie-patisserie/boulangerie-patisserie-risques.html'
    },
    restaurant: {
      label: 'INRS — Restauration collective : évaluer les risques',
      url: 'https://www.inrs.fr/actualites/restauration-collective-outil-evaluation-risques-professionnels.html'
    },
    office: {
      label: 'INRS — Travail de bureau : évaluer les risques',
      url: 'https://www.inrs.fr/metiers/commerce-service/travail-bureau/travail-bureau-evaluer.html'
    },
    screen: {
      label: 'INRS — Prévention du travail sur écran',
      url: 'https://www.inrs.fr/risques/travail-ecran/prevention-risques.html'
    },
    psychosocial: {
      label: 'INRS — Risques psychosociaux',
      url: 'https://www.inrs.fr/risques/psychosociaux/ce-qu-il-faut-retenir.html'
    },
    physical: {
      label: 'INRS — Risques liés à l’activité physique',
      url: 'https://www.inrs.fr/risques/activite-physique/ce-qu-il-faut-retenir.html'
    },
    chemical: {
      label: 'INRS — Risques chimiques',
      url: 'https://www.inrs.fr/risques/chimiques/ce-qu-il-faut-retenir.html'
    },
    road: {
      label: 'INRS — Risque routier en mission',
      url: 'https://www.inrs.fr/risques/routiers/ce-qu-il-faut-retenir.html'
    },
    noise: {
      label: 'INRS — Bruit',
      url: 'https://www.inrs.fr/risques/bruit/ce-qu-il-faut-retenir.html'
    },
    machines: {
      label: 'INRS — Machines',
      url: 'https://www.inrs.fr/risques/machines/ce-qu-il-faut-retenir.html'
    },
    biological: {
      label: 'INRS — Agents biologiques',
      url: 'https://www.inrs.fr/risques/biologiques/ce-qu-il-faut-retenir.html'
    },
    heat: {
      label: 'INRS — Travail à la chaleur',
      url: 'https://www.inrs.fr/risques/chaleur/ce-qu-il-faut-retenir.html'
    }
  };

  function option(value, label, control, details) {
    return { value, label, control, details: details || '' };
  }

  function question(config) {
    return Object.assign({
      help: '',
      required: true,
      options: [
        option('uncontrolled', 'Oui, et la situation est peu ou pas maîtrisée', 4),
        option('partial', 'Oui, mais des mesures existent déjà', 2),
        option('controlled', 'Oui, la situation est correctement maîtrisée', 1),
        option('no', 'Non, cette situation ne concerne pas cette unité', 0),
        option('unknown', 'Je ne sais pas encore', 3)
      ],
      severity: 2,
      frequency: 2,
      existingMeasures: '',
      prevention: [],
      source: SOURCES.duerp,
      specialist: ''
    }, config);
  }

  const QUESTIONS = {
    manual_handling: question({
      id: 'manual_handling',
      title: 'Des charges sont-elles portées, déplacées ou soulevées manuellement ?',
      help: 'Tenez compte du poids, de la fréquence, des distances, des torsions et des prises au sol ou en hauteur.',
      riskTitle: 'Manutention manuelle et efforts physiques',
      danger: 'Charges, efforts, gestes contraignants',
      situation: 'Port, transfert ou déplacement manuel de charges dans le travail courant.',
      severity: 3,
      frequency: 3,
      prevention: ['Réduire le poids unitaire des charges', 'Rapprocher stockage et zone d’utilisation', 'Installer une aide mécanique adaptée', 'Organiser les flux avant de former aux gestes'],
      source: SOURCES.physical
    }),
    slips: question({
      id: 'slips',
      title: 'Les sols peuvent-ils être glissants, irréguliers ou encombrés ?',
      help: 'Eau, graisse, farine, câbles, cartons, seuils, marches ou nettoyage en présence d’activité.',
      riskTitle: 'Chutes de plain-pied',
      danger: 'Sol glissant, encombrement, dénivellation',
      situation: 'Déplacements dans une zone où l’adhérence ou la visibilité du cheminement peut être dégradée.',
      severity: 3,
      frequency: 3,
      prevention: ['Supprimer les obstacles et matérialiser les circulations', 'Choisir un revêtement adapté', 'Organiser le nettoyage hors périodes de flux', 'Traiter immédiatement les déversements'],
      source: SOURCES.physical
    }),
    burns: question({
      id: 'burns',
      title: 'Existe-t-il un contact possible avec une surface, un liquide ou une vapeur chaude ?',
      help: 'Fours, plaques, friteuses, vapeur, huiles, ustensiles ou récipients chauds.',
      riskTitle: 'Brûlures et exposition à la chaleur',
      danger: 'Surfaces, liquides ou ambiances chaudes',
      situation: 'Manipulation ou passage à proximité d’équipements ou produits chauds.',
      severity: 4,
      frequency: 2,
      prevention: ['Séparer les flux chauds et les circulations', 'Maintenir les poignées et protections thermiques', 'Prévoir une zone de dépose dégagée', 'Vérifier les équipements avant utilisation'],
      source: SOURCES.heat
    }),
    machines: question({
      id: 'machines',
      title: 'Des machines peuvent-elles couper, écraser, entraîner ou projeter ?',
      help: 'Incluez l’utilisation normale, le nettoyage, le débourrage, la maintenance et les réglages.',
      riskTitle: 'Coupure, écrasement ou entraînement par une machine',
      danger: 'Éléments mobiles, outils coupants, énergie résiduelle',
      situation: 'Utilisation, nettoyage ou intervention sur un équipement de travail.',
      severity: 4,
      frequency: 2,
      prevention: ['Maintenir les carters et dispositifs de sécurité', 'Consigner l’énergie avant nettoyage ou débourrage', 'Interdire les neutralisations de sécurité', 'Former à la procédure propre à la machine'],
      source: SOURCES.machines,
      specialist: 'Une machine non conforme ou modifiée nécessite l’avis d’un préventeur compétent.'
    }),
    flour_dust: question({
      id: 'flour_dust',
      title: 'Des poussières de farine, sucre ou poudres sont-elles mises en suspension ?',
      help: 'Vidage des sacs, fleurage, mélange, nettoyage à sec ou aspiration inadaptée.',
      riskTitle: 'Exposition aux poussières de farine ou de poudres',
      danger: 'Poussières inhalables et allergènes',
      situation: 'Mise en suspension de poudres lors du dosage, du mélange ou du nettoyage.',
      severity: 3,
      frequency: 3,
      prevention: ['Verser au plus près de la cuve et à faible hauteur', 'Privilégier l’aspiration adaptée au balayage', 'Réduire le fleurage manuel', 'Fermer les contenants et entretenir la ventilation'],
      source: SOURCES.bakery,
      specialist: 'En cas de symptômes respiratoires ou cutanés, orienter vers le SPST sans recueillir de donnée médicale dans l’outil.'
    }),
    chemicals: question({
      id: 'chemicals',
      title: 'Des produits chimiques ou de nettoyage sont-ils utilisés ?',
      help: 'Étiquetage, fiches de données de sécurité, dilution, mélange, ventilation et stockage.',
      riskTitle: 'Exposition à des produits chimiques',
      danger: 'Produits irritants, corrosifs, nocifs ou inflammables',
      situation: 'Préparation, utilisation, transvasement ou stockage de produits chimiques.',
      severity: 3,
      frequency: 2,
      prevention: ['Tenir l’inventaire des produits et les FDS à jour', 'Supprimer les produits inutiles ou substituer les plus dangereux', 'Interdire les mélanges non prévus', 'Conserver l’étiquetage et ventiler la zone'],
      source: SOURCES.chemical,
      specialist: 'Les CMR, l’amiante ou une exposition non quantifiée nécessitent une évaluation spécialisée.'
    }),
    repetitive: question({
      id: 'repetitive',
      title: 'Le travail comporte-t-il des gestes répétitifs ou des postures contraignantes ?',
      help: 'Répétition, cadence, bras en l’air, torsions, station debout ou assise prolongée.',
      riskTitle: 'Troubles musculosquelettiques liés aux gestes et postures',
      danger: 'Répétitivité, posture statique ou amplitude articulaire',
      situation: 'Réalisation répétée de gestes ou maintien prolongé d’une posture contraignante.',
      severity: 3,
      frequency: 3,
      prevention: ['Adapter la hauteur et la profondeur du poste', 'Faire varier les tâches et les postures', 'Réduire les prises loin du corps', 'Agir sur la cadence et les possibilités de récupération'],
      source: SOURCES.physical
    }),
    screen_work: question({
      id: 'screen_work',
      title: 'Le travail sur écran est-il prolongé ou réalisé sur un poste peu adapté ?',
      help: 'Écran, clavier, souris, siège, lumière, interruptions, durée et organisation des tâches.',
      riskTitle: 'Travail sur écran et sédentarité',
      danger: 'Posture statique, fatigue visuelle, charge informationnelle',
      situation: 'Utilisation habituelle d’un écran dans des conditions ergonomiques ou organisationnelles imparfaites.',
      severity: 2,
      frequency: 3,
      prevention: ['Régler le mobilier et positionner l’écran face à l’utilisateur', 'Alterner les activités et interrompre la posture assise', 'Réduire les reflets et améliorer l’éclairage', 'Adapter les outils numériques au travail réel'],
      source: SOURCES.screen
    }),
    workload: question({
      id: 'workload',
      title: 'Les salariés rencontrent-ils une forte pression temporelle ou des interruptions fréquentes ?',
      help: 'Pics d’activité, sous-effectif, demandes simultanées, objectifs contradictoires ou absence de marges de manœuvre.',
      riskTitle: 'Intensité du travail et charge mentale',
      danger: 'Pression temporelle, interruptions, exigences contradictoires',
      situation: 'Activité réalisée sous contrainte de temps avec peu de possibilités de régulation.',
      severity: 3,
      frequency: 3,
      prevention: ['Analyser les pics et adapter les ressources', 'Clarifier les priorités et les critères de qualité', 'Prévoir des relais et des temps sans interruption', 'Associer l’équipe à l’organisation du travail'],
      source: SOURCES.psychosocial,
      specialist: 'Une situation de souffrance, violence ou harcèlement doit être prise en charge hors de l’outil avec les acteurs compétents.'
    }),
    aggression: question({
      id: 'aggression',
      title: 'Les salariés peuvent-ils subir des incivilités, menaces ou agressions ?',
      help: 'Accueil du public, réclamations, refus, encaissement, travail isolé ou horaires sensibles.',
      riskTitle: 'Violences externes et incivilités',
      danger: 'Comportement agressif ou menaçant d’un tiers',
      situation: 'Interaction avec un client, usager ou tiers dans une situation potentiellement conflictuelle.',
      severity: 4,
      frequency: 2,
      prevention: ['Définir une conduite à tenir et un droit au relais', 'Aménager l’accueil et les moyens d’alerte', 'Tracer et analyser les incidents', 'Ne pas laisser un salarié seul face à une situation menaçante'],
      source: SOURCES.psychosocial
    }),
    road: question({
      id: 'road',
      title: 'Des déplacements routiers sont-ils réalisés pour le travail ?',
      help: 'Livraisons, visites, achats, urgences, état du véhicule, téléphone et pression horaire.',
      riskTitle: 'Risque routier en mission',
      danger: 'Conduite, circulation, fatigue et contraintes temporelles',
      situation: 'Déplacement professionnel en véhicule motorisé.',
      severity: 4,
      frequency: 2,
      prevention: ['Planifier les tournées avec des marges réalistes', 'Interdire les communications en conduite', 'Entretenir les véhicules et vérifier les charges', 'Éviter les déplacements inutiles et tenir compte de la fatigue'],
      source: SOURCES.road
    }),
    noise: question({
      id: 'noise',
      title: 'Le bruit gêne-t-il les échanges, la concentration ou impose-t-il d’élever la voix ?',
      help: 'Machines, extraction, musique, chocs, appels ou espaces ouverts.',
      riskTitle: 'Exposition au bruit',
      danger: 'Niveau sonore continu ou impulsionnel',
      situation: 'Travail dans une ambiance sonore gênante ou potentiellement dommageable.',
      severity: 3,
      frequency: 3,
      prevention: ['Réduire le bruit à la source', 'Éloigner ou isoler les équipements', 'Entretenir les machines et traiter l’acoustique', 'Faire mesurer l’exposition en cas de doute'],
      source: SOURCES.noise,
      specialist: 'Une gêne importante ou une exposition potentiellement élevée justifie une mesure par une personne compétente.'
    }),
    biological: question({
      id: 'biological',
      title: 'Existe-t-il un contact possible avec des déchets, fluides, aliments crus ou agents biologiques ?',
      help: 'Nettoyage, sanitaires, déchets, denrées, animaux, personnes malades ou objets souillés.',
      riskTitle: 'Exposition à des agents biologiques',
      danger: 'Micro-organismes ou matières potentiellement contaminées',
      situation: 'Contact direct ou indirect avec une source biologique lors du travail.',
      severity: 3,
      frequency: 2,
      prevention: ['Organiser l’hygiène des mains et le nettoyage', 'Séparer les circuits propres et sales', 'Prévoir les protections adaptées à la tâche', 'Former aux conduites à tenir en cas d’exposition'],
      source: SOURCES.biological
    }),
    heights: question({
      id: 'heights',
      title: 'Des tâches sont-elles réalisées en hauteur ou avec un accès improvisé ?',
      help: 'Escabeau, échelle, mezzanine, stockage en hauteur, toiture ou marchepied improvisé.',
      riskTitle: 'Chute de hauteur',
      danger: 'Dénivellation ou équipement d’accès inadapté',
      situation: 'Accès ou travail au-dessus du sol sans protection collective suffisante.',
      severity: 4,
      frequency: 2,
      prevention: ['Supprimer le besoin de travailler en hauteur', 'Installer une protection collective', 'Utiliser un équipement d’accès adapté et vérifié', 'Interdire les moyens improvisés'],
      source: SOURCES.physical,
      specialist: 'Les travaux en hauteur réguliers ou complexes nécessitent une analyse dédiée.'
    }),
    electrical: question({
      id: 'electrical',
      title: 'Des équipements électriques dégradés, humides ou bricolés sont-ils utilisés ?',
      help: 'Câbles, prises, rallonges, coffrets, appareils portatifs et interventions improvisées.',
      riskTitle: 'Risque électrique',
      danger: 'Électricité et défaut d’isolement',
      situation: 'Utilisation ou intervention à proximité d’une installation ou d’un équipement électrique.',
      severity: 4,
      frequency: 1,
      prevention: ['Retirer immédiatement le matériel dégradé', 'Limiter les rallonges et branchements multiples', 'Faire intervenir une personne habilitée', 'Maintenir les vérifications réglementaires'],
      source: SOURCES.machines,
      specialist: 'Toute intervention électrique doit être confiée à une personne compétente et habilitée selon le cas.'
    }),
    fire: question({
      id: 'fire',
      title: 'Des produits combustibles, sources d’ignition ou obstacles à l’évacuation sont-ils présents ?',
      help: 'Gaz, solvants, huiles, cartons, batteries, cuisson, chargeurs, sorties et extincteurs.',
      riskTitle: 'Incendie et évacuation',
      danger: 'Combustible, source d’ignition ou évacuation difficile',
      situation: 'Présence simultanée de matières combustibles et d’une source possible d’inflammation.',
      severity: 4,
      frequency: 1,
      prevention: ['Réduire et séparer les stocks combustibles', 'Maintenir les dégagements et sorties libres', 'Vérifier les moyens d’extinction et consignes', 'Former l’équipe et organiser des exercices adaptés'],
      source: SOURCES.duerp
    }),
    lone_work: question({
      id: 'lone_work',
      title: 'Une personne peut-elle travailler seule sans possibilité d’aide rapide ?',
      help: 'Ouverture, fermeture, déplacement, intervention technique ou zone isolée.',
      riskTitle: 'Travail isolé',
      danger: 'Absence d’assistance en cas d’incident',
      situation: 'Travail réalisé hors de vue ou de portée d’autres personnes pendant une durée significative.',
      severity: 4,
      frequency: 2,
      prevention: ['Éviter l’isolement pour les tâches dangereuses', 'Définir un système de contact et d’alerte', 'Organiser les levées de doute', 'Adapter les horaires et procédures'],
      source: SOURCES.duerp
    })
  };

  const SECTOR_PACKS = {
    bakery: {
      id: 'bakery',
      label: 'Boulangerie, pâtisserie et commerce alimentaire',
      description: 'Production, cuisson, vente, nettoyage, livraison et gestion.',
      source: SOURCES.bakery,
      units: [
        { key: 'production', name: 'Fournil & production', icon: '♨', people: 3, place: 'Fournil', tasks: 'Préparation, pétrissage, façonnage, cuisson et nettoyage', questions: ['manual_handling','flour_dust','machines','burns','slips','repetitive','noise','chemicals','fire'] },
        { key: 'sales', name: 'Vente & caisse', icon: '▦', people: 2, place: 'Boutique', tasks: 'Accueil, mise en vitrine, service, encaissement et entretien', questions: ['manual_handling','repetitive','machines','slips','aggression','workload','lone_work','fire'] },
        { key: 'delivery', name: 'Livraisons', icon: '↗', people: 1, place: 'Véhicule et sites clients', tasks: 'Préparation, chargement, conduite et déchargement', questions: ['road','manual_handling','lone_work','slips'] },
        { key: 'admin', name: 'Gestion & administratif', icon: '⌁', people: 1, place: 'Bureau', tasks: 'Commandes, planning, comptabilité et relations fournisseurs', questions: ['screen_work','workload','repetitive','fire'] }
      ]
    },
    restaurant: {
      id: 'restaurant',
      label: 'Restaurant, café et restauration collective',
      description: 'Cuisine, salle, plonge, réception des marchandises et livraison.',
      source: SOURCES.restaurant,
      units: [
        { key: 'kitchen', name: 'Cuisine & préparation', icon: '♨', people: 4, place: 'Cuisine', tasks: 'Préparation, cuisson, dressage et nettoyage', questions: ['manual_handling','machines','burns','slips','repetitive','chemicals','biological','workload','fire'] },
        { key: 'service', name: 'Salle & service', icon: '▦', people: 3, place: 'Salle et terrasse', tasks: 'Accueil, prise de commande, service et encaissement', questions: ['manual_handling','slips','repetitive','aggression','workload','lone_work'] },
        { key: 'dishwashing', name: 'Plonge & nettoyage', icon: '≈', people: 2, place: 'Plonge et locaux techniques', tasks: 'Lavage, déchets, entretien et rangement', questions: ['chemicals','biological','burns','slips','manual_handling','repetitive'] },
        { key: 'delivery', name: 'Approvisionnement & livraison', icon: '↗', people: 1, place: 'Réserve et véhicule', tasks: 'Réception, stockage, déplacement et livraison', questions: ['road','manual_handling','slips','lone_work'] }
      ]
    },
    office: {
      id: 'office',
      label: 'Services, conseil et travail de bureau',
      description: 'Travail sur écran, réunions, télétravail, accueil et déplacements.',
      source: SOURCES.office,
      units: [
        { key: 'office', name: 'Bureaux & production intellectuelle', icon: '⌁', people: 8, place: 'Bureaux', tasks: 'Travail sur écran, appels, rédaction, réunions', questions: ['screen_work','workload','repetitive','slips','fire','aggression'] },
        { key: 'remote', name: 'Télétravail', icon: '⌂', people: 5, place: 'Domicile', tasks: 'Travail à distance, visioconférences et accès aux outils', questions: ['screen_work','workload','lone_work','repetitive'] },
        { key: 'travel', name: 'Déplacements professionnels', icon: '↗', people: 3, place: 'Sites clients et transports', tasks: 'Conduite, transports et interventions extérieures', questions: ['road','lone_work','aggression','manual_handling'] },
        { key: 'reception', name: 'Accueil & logistique légère', icon: '▦', people: 2, place: 'Accueil et réserves', tasks: 'Accueil, courrier, fournitures et manutention légère', questions: ['aggression','manual_handling','slips','lone_work'] }
      ]
    },
    retail: {
      id: 'retail',
      label: 'Commerce de détail',
      description: 'Réception, réserve, mise en rayon, vente, caisse et fermeture.',
      source: SOURCES.duerp,
      units: [
        { key: 'sales', name: 'Vente & conseil', icon: '▦', people: 4, place: 'Surface de vente', tasks: 'Accueil, conseil, mise en rayon et encaissement', questions: ['manual_handling','repetitive','slips','aggression','workload','lone_work','fire'] },
        { key: 'stock', name: 'Réserve & réception', icon: '□', people: 2, place: 'Réserve et quai', tasks: 'Réception, stockage, préparation et inventaire', questions: ['manual_handling','heights','slips','machines','lone_work','fire'] },
        { key: 'delivery', name: 'Livraison & retraits', icon: '↗', people: 1, place: 'Véhicule et zone de retrait', tasks: 'Chargement, livraison, remise client', questions: ['road','manual_handling','aggression','lone_work'] },
        { key: 'admin', name: 'Gestion & administratif', icon: '⌁', people: 1, place: 'Bureau', tasks: 'Planning, commandes, paie et suivi commercial', questions: ['screen_work','workload','repetitive'] }
      ]
    },
    garage: {
      id: 'garage',
      label: 'Garage automobile et atelier de réparation',
      description: 'Atelier, levage, produits chimiques, bruit, essais et accueil.',
      source: SOURCES.duerp,
      units: [
        { key: 'workshop', name: 'Atelier mécanique', icon: '⚙', people: 4, place: 'Atelier', tasks: 'Diagnostic, entretien, réparation et essais', questions: ['machines','manual_handling','chemicals','noise','slips','electrical','fire','repetitive'] },
        { key: 'bodywork', name: 'Carrosserie & peinture', icon: '◈', people: 2, place: 'Zone carrosserie', tasks: 'Ponçage, préparation, peinture et soudage', questions: ['chemicals','noise','machines','fire','manual_handling','repetitive'] },
        { key: 'reception', name: 'Accueil & réception véhicules', icon: '▦', people: 2, place: 'Accueil et parc', tasks: 'Accueil client, devis, déplacements de véhicules', questions: ['aggression','screen_work','road','workload','slips'] },
        { key: 'roadtest', name: 'Essais & dépannage', icon: '↗', people: 2, place: 'Route et sites clients', tasks: 'Essais routiers, dépannage et remorquage léger', questions: ['road','lone_work','manual_handling','aggression'] }
      ]
    },
    generic: {
      id: 'generic',
      label: 'Autre activité — parcours générique',
      description: 'Base générale à personnaliser avec les situations de travail réelles.',
      source: SOURCES.duerp,
      units: [
        { key: 'main', name: 'Activité principale', icon: '◇', people: 3, place: 'Lieu principal', tasks: 'Activités principales à préciser', questions: ['manual_handling','slips','repetitive','machines','chemicals','workload','fire','lone_work'] },
        { key: 'admin', name: 'Administration', icon: '⌁', people: 1, place: 'Bureau', tasks: 'Gestion, planification et travail sur écran', questions: ['screen_work','workload','repetitive'] }
      ]
    }
  };

  window.PREVIO_DATA = { SOURCES, QUESTIONS, SECTOR_PACKS };
})();
