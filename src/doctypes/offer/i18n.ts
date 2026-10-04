import type { Lang } from '../../core/types';

export const offerLabels = {
  de: {
    eyebrow: 'Angebot', title: 'Kostenvoranschlag für Konservierung und Restaurierung',
    number: 'Angebot Nr.', validUntil: 'Gültig bis',
    measures: 'Vorgeschlagene Massnahmen', optional: 'Optionale Massnahmen',
    rate: 'Stundensatz CHF {rate}.– / Std.', hoursCol: 'Aufwand (ca. Std.)', descCol: 'Beschreibung',
    totalMain: 'Total Aufwand', totalOptional: 'Optional zusätzlich', hoursUnit: 'Std.',
    costHeading: 'Kostenaufstellung',
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
    notes: { hinweis: 'Note:', fazit: 'Conclusion:', empfehlung: 'Recommendation:' },
    sections: { artist: 'About the Artist and Work', condition: 'Condition Assessment' },
  },
} satisfies Record<Lang, unknown>;

export const costTemplate = {
  de: {
    base: 'Die Arbeiten werden im Atelier von Snape Art Conservation in Richterswil ausgeführt. Transport sowie Versicherung während des Transports erfolgen durch den Auftraggeber.',
    delivery: ' Die Anlieferung des Werks ins Atelier ist ab dem {delivery} möglich{pickup}.',
    pickup: '; die Abholung kann voraussichtlich ab {pickup} erfolgen',
    effort: ' Der voraussichtliche Arbeitsaufwand beträgt <strong>ca. {hours} Stunden</strong> zum Stundensatz von <strong>CHF {rate}.–</strong>.',
    cost: ' Daraus ergeben sich voraussichtliche {costWord} von <strong>ca. CHF {chf}</strong>.',
    costWordPlain: 'Kosten', costWordLabour: 'Arbeitskosten',
    optional: ' Die optionalen Massnahmen{detail} würden zusätzlich ca. {hours} Stunden bzw. <strong>ca. CHF {chf}</strong> betragen.',
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
    optional: ' The optional treatment{detail} would add approx. {hours} hours, or <strong>approx. CHF {chf}</strong>.',
    materials: ' Material costs are not included and will be invoiced separately according to actual use.',
    closing: ' The final effort depends on the actual course of treatment; any additional effort will be agreed with the client in advance.',
  },
} satisfies Record<Lang, unknown>;
