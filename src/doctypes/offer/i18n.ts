import type { Lang } from '../../core/types';

export const offerLabels = {
  de: {
    eyebrow: 'Angebot', title: 'Kostenvoranschlag für Konservierung und Restaurierung',
    number: 'Angebot Nr.', validUntil: 'Gültig bis',
    measures: 'Vorgeschlagene Massnahmen', optional: 'Optionale Massnahmen',
    rate: 'Stundensatz CHF {rate}.– / Std.', hoursCol: 'Aufwand (ca. Std.)', descCol: 'Beschreibung',
    totalMain: 'Total Aufwand', totalOptional: 'Optional zusätzlich', hoursUnit: 'Std.',
    costHeading: 'Kostenaufstellung',
    replaces: 'Ersetzt Angebot Rev. {label} vom {date}',
    objects: { heading: 'Objekte und Aufwandschätzung', imageCol: 'Bild', noCol: 'Obj.-Nr.', descCol: 'Bezeichnung / Technik / Einschätzung', sizeCol: 'Masse gerahmt (H\u00a0×\u00a0B)', hoursCol: 'Geschätzter Zeitaufwand' },
    notes: { hinweis: 'Hinweis:', fazit: 'Fazit:', empfehlung: 'Empfehlung:' },
    sections: { artist: 'Zum Künstler und Werk', condition: 'Zustandsbeurteilung' },
  },
  en: {
    eyebrow: 'Offer', title: 'Cost Estimate for Conservation and Restoration',
    number: 'Offer No.', validUntil: 'Valid until',
    measures: 'Proposed Treatment', optional: 'Optional Treatment',
    rate: 'Hourly rate CHF {rate}.– / hr', hoursCol: 'Effort (approx. hrs)', descCol: 'Description',
    totalMain: 'Total effort', totalOptional: 'Optional additional', hoursUnit: 'hrs',
    costHeading: 'Cost Summary',
    replaces: 'Replaces offer Rev. {label} of {date}',
    objects: { heading: 'Objects and Effort Estimate', imageCol: 'Image', noCol: 'No.', descCol: 'Title / Technique / Assessment', sizeCol: 'Framed size (H\u00a0×\u00a0W)', hoursCol: 'Estimated effort' },
    notes: { hinweis: 'Note:', fazit: 'Conclusion:', empfehlung: 'Recommendation:' },
    sections: { artist: 'About the Artist and Work', condition: 'Condition Assessment' },
  },
} satisfies Record<Lang, unknown>;

/** Label/value lines of the cost summary (cost.style = 'lines') */
export const costLineLabels = {
  de: { rate: 'Stundensatz', rateVal: 'CHF {rate}.– / Stunde', effort: 'Geschätzter Zeitaufwand', effortVal: 'ca. {hours} Stunden{objs}', objs: ' für {n} Objekte', cost: 'Geschätzte Arbeitskosten', to: ' bis ' },
  en: { rate: 'Hourly rate', rateVal: 'CHF {rate}.– / hour', effort: 'Estimated effort', effortVal: 'approx. {hours} hours{objs}', objs: ' for {n} objects', cost: 'Estimated labour costs', to: ' to ' },
} satisfies Record<Lang, unknown>;

export const costTemplate = {
  de: {
    base: 'Die Arbeiten werden im Atelier von Snape Art Conservation in Richterswil ausgeführt. Transport sowie Versicherung während des Transports erfolgen durch den Auftraggeber.',
    delivery: ' Die Anlieferung des Werks ins Atelier ist ab dem {delivery} möglich{pickup}.',
    pickup: '; die Abholung kann voraussichtlich ab {pickup} erfolgen',
    effort: ' Der voraussichtliche Arbeitsaufwand beträgt <strong>ca. {hours} Stunden</strong> zum Stundensatz von <strong>CHF {rate}.–</strong>.',
    cost: ' Daraus ergeben sich voraussichtliche {costWord} von <strong>ca. CHF {chf}</strong>.',
    costWordPlain: 'Kosten', costWordLabour: 'Arbeitskosten',
    effortOptions: ' Der voraussichtliche Arbeitsaufwand zum Stundensatz von <strong>CHF {rate}.–</strong> beträgt je nach gewählter Variante: {list}.',
    optionItem: '{label}: <strong>ca. {hours} Stunden</strong> bzw. <strong>ca. CHF {chf}</strong>',
    optional: ' Die optionalen Massnahmen{detail} würden zusätzlich <strong>ca. {hours} Stunden</strong> bzw. <strong>ca. CHF {chf}</strong> betragen.',
    materials: ' Materialkosten sind darin nicht enthalten und werden separat nach effektivem Aufwand verrechnet.',
    closing: ' Der definitive Aufwand richtet sich nach dem tatsächlichen Behandlungsverlauf; allfälliger Mehraufwand wird vorgängig mit dem Auftraggeber abgesprochen.',
  },
  en: {
    base: 'The work will be carried out in the studio of Snape Art Conservation in Richterswil. Transport and transport insurance are the responsibility of the client.',
    delivery: ' The artwork can be delivered to the studio from {delivery}{pickup}.',
    pickup: '; collection is expected from {pickup}',
    effort: ' The estimated effort is <strong>approx. {hours} hours</strong> at an hourly rate of <strong>CHF {rate}.–</strong>.',
    cost: ' This results in estimated {costWord} of <strong>approx. CHF {chf}</strong>.',
    costWordPlain: 'costs', costWordLabour: 'labour costs',
    effortOptions: ' The estimated effort at an hourly rate of <strong>CHF {rate}.–</strong> depends on the option chosen: {list}.',
    optionItem: '{label}: <strong>approx. {hours} hours</strong>, or <strong>approx. CHF {chf}</strong>',
    optional: ' The optional treatment{detail} would add <strong>approx. {hours} hours</strong>, or <strong>approx. CHF {chf}</strong>.',
    materials: ' Material costs are not included and will be invoiced separately according to actual use.',
    closing: ' The final effort depends on the actual course of treatment; any additional effort will be agreed with the client in advance.',
  },
} satisfies Record<Lang, unknown>;
