const fs = require("fs");

const T = {
  "": {
    starterFeat: "Cobranza por comprobante validado",
    note2: "Studio incluye pago con tarjeta y transferencia vía pasarela, a costo real (hoy ~3,2%).",
    faqP: [
      ["¿Cuánto me cuesta vender entradas?", "Una comisión por venta gestionada: 5% + IVA + pasarela de pago (~9,1% todo incluido), descontada de tu liquidación. El asistente paga el precio exacto y la venta en puerta en efectivo no lleva comisión."],
      ["¿Necesito un plan para vender?", "No. Puedes publicar tu evento y vender entradas siempre. El plan suma multi-staff, analíticas, CRM y campañas de marketing."],
      ["¿Cuándo recibo la plata de mis ventas?", "Al cerrar el evento la liquidación queda lista con la comisión ya descontada y el desembolso corre según el ciclo configurado."],
      ["¿Mi público tiene que instalar una app?", "No. Compra en la web, recibe su entrada con QR y tú o tu staff la validan en la puerta desde el teléfono."],
      ["¿Puedo cancelar el plan?", "Sí, el mensual cuando quieras; el semestral y el anual corren hasta el final del período con su descuento."],
    ],
    faqA: [
      ["¿Cómo pagan mis alumnos?", "Se inscriben a tu plan o clase y pagan desde la app con su medio habitual. Tú ves quién está al día sin perseguir ni revisar comprobantes."],
      ["¿Puedo registrar pagos en efectivo o transferencia?", "Sí. Lo registras desde tu consola y el alumno queda al día igual; la app es tu control de pagos, no solo la pasarela."],
      ["¿Qué pasa si supero los alumnos de mi plan?", "Te avisamos para subir de plan; tu operación no se corta de un día para otro."],
      ["¿Hay permanencia mínima?", "No. El mensual se cancela cuando quieras; el semestral y el anual corren hasta el final del período con su descuento."],
    ],
    we: "Los eventos de la escena se publican en una sola cartelera",
  },
  "en/": {
    starterFeat: "Collections via validated receipts",
    note2: "Studio includes card and bank transfer payments via gateway at real cost (today ~3.2%).",
    faqP: [
      ["How much does it cost me to sell tickets?", "A commission per managed sale: 5% + VAT + payment gateway (~9.1% all-in), deducted from your settlement. Attendees pay the exact price; cash door sales carry no commission."],
      ["Do I need a plan to sell?", "No. You can publish your event and sell tickets anytime. A plan adds multi-staff, analytics, CRM and marketing campaigns."],
      ["When do I get my sales money?", "When the event closes, the settlement is ready with the commission already deducted; payout follows the configured cycle."],
      ["Does my audience need to install an app?", "No. They buy on the web, get a QR ticket, and you or your staff validate it at the door from a phone."],
      ["Can I cancel my plan?", "Yes, monthly anytime; semiannual and annual run to the end of the period with their discount."],
    ],
    faqA: [
      ["How do my students pay?", "They join your plan or class and pay in the app with their usual method. You see who's up to date without chasing or checking receipts."],
      ["Can I record cash or transfer payments?", "Yes. You log it in your console and the student is marked up to date; the app is your payment control, not only the gateway."],
      ["What if I exceed my plan's student cap?", "We let you know so you can move up a plan; your operation doesn't stop overnight."],
      ["Is there a minimum commitment?", "No. Monthly cancels anytime; semiannual and annual run to the end of the period with their discount."],
    ],
    we: "The scene's events are published in one board",
  },
  "fr/": {
    starterFeat: "Encaissement par justificatif validé",
    note2: "Studio inclut le paiement par carte et virement via passerelle, au coût réel (~3,2 % aujourd'hui).",
    faqP: [
      ["Combien coûte la vente de billets ?", "Une commission par vente gérée : 5 % + TVA + passerelle de paiement (~9,1 % tout compris), déduite de ton règlement. L'assistant paie le prix exact et la vente à la porte en espèces ne comporte aucune commission."],
      ["Ai-je besoin d'un abonnement pour vendre ?", "Non. Tu peux publier ton événement et vendre des billets à tout moment. L'abonnement ajoute multi-staff, analyses, CRM et campagnes marketing."],
      ["Quand est-ce que je reçois l'argent de mes ventes ?", "À la clôture de l'événement, le règlement est prêt avec la commission déjà déduite ; le versement suit le cycle configuré."],
      ["Mon public doit-il installer une app ?", "Non. Il achète sur le web, reçoit son billet avec QR et toi ou ton staff le validez à la porte depuis le téléphone."],
      ["Puis-je annuler mon abonnement ?", "Oui, le mensuel quand tu veux ; le semestriel et l'annuel courent jusqu'à la fin de la période avec leur remise."],
    ],
    faqA: [
      ["Comment mes élèves paient-ils ?", "Ils s'inscrivent à ton forfait ou cours et paient depuis l'app avec leur moyen habituel. Tu vois qui est à jour sans courir après ni vérifier de justificatifs."],
      ["Puis-je enregistrer des paiements en espèces ou par virement ?", "Oui. Tu l'enregistres depuis ta console et l'élève est à jour pareil ; l'app est ton contrôle des paiements, pas seulement la passerelle."],
      ["Que se passe-t-il si je dépasse le plafond d'élèves ?", "On t'avertit pour passer au forfait supérieur ; ton activité ne s'arrête pas du jour au lendemain."],
      ["Y a-t-il un engagement minimum ?", "Non. Le mensuel s'annule quand tu veux ; le semestriel et l'annuel courent jusqu'à la fin de la période avec leur remise."],
    ],
    we: "Les événements de la scène se publient dans une seule carte",
  },
  "pt-PT/": {
    starterFeat: "Cobrança por comprovativo validado",
    note2: "Studio inclui pagamento com cartão e transferência via gateway, a custo real (hoje ~3,2%).",
    faqP: [
      ["Quanto custa vender bilhetes?", "Uma comissão por venda gerida: 5% + IVA + gateway de pagamento (~9,1% tudo incluído), deduzida da tua liquidação. O assistente paga o preço exato e a venda à porta em dinheiro não tem comissão."],
      ["Preciso de um plano para vender?", "Não. Podes publicar o teu evento e vender bilhetes a qualquer momento. O plano adiciona multi-staff, analíticas, CRM e campanhas de marketing."],
      ["Quando recebo o dinheiro das minhas vendas?", "Ao fechar o evento, a liquidação fica pronta com a comissão já deduzida; o desembolso segue o ciclo configurado."],
      ["O meu público precisa de instalar uma app?", "Não. Compra na web, recebe o bilhete com QR e tu ou o teu staff validam à porta a partir do telemóvel."],
      ["Posso cancelar o meu plano?", "Sim, o mensal quando quiseres; o semestral e o anual correm até ao fim do período com o seu desconto."],
    ],
    faqA: [
      ["Como pagam os meus alunos?", "Inscrevem-se no teu plano ou aula e pagam na app com o meio habitual. Vês quem está em dia sem perseguir nem rever comprovativos."],
      ["Posso registar pagamentos em dinheiro ou transferência?", "Sim. Registas na tua consola e o aluno fica em dia na mesma; a app é o teu controlo de pagamentos, não apenas a gateway."],
      ["E se eu exceder o limite de alunos do meu plano?", "Avisamos-te para subires de plano; a tua operação não corta de um dia para o outro."],
      ["Há um compromisso mínimo?", "Não. O mensal cancela-se quando quiseres; o semestral e o anual correm até ao fim do período com o seu desconto."],
    ],
    we: "Os eventos da cena publicam-se numa única programação",
  },
};

for (const loc of Object.keys(T)) {
  const f = "apps/web/src/i18n/parts/" + loc + "landing.json";
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const d = T[loc];

  // FAQ reescritas por objeciones reales
  j.landingProducer.faq.items = d.faqP.map(([q, a]) => ({ q, a }));
  j.landingAcademy.faq.items = d.faqA.map(([q, a]) => ({ q, a }));

  // weekEmpty producer: posicionamiento sin claim de clientela
  j.landingProducer.weekEmpty = d.we;

  // Starter = solo comprobante: actualiza feature + nota de pricing
  const tiers = j.landingAcademy?.pricing?.tiers || [];
  for (const t of tiers) {
    if (t.name === "Starter" && Array.isArray(t.features) && t.features.length > 0) {
      t.features[0] = d.starterFeat;
    }
  }
  const note = j.landingAcademy?.pricing?.note;
  if (typeof note === "string") {
    // conserva la línea de descuentos por ciclo; reemplaza la línea de pasarela
    const lines = note.split("\n").filter((l) => !/pasarela|gateway|passerelle/i.test(l));
    lines.push(d.note2);
    j.landingAcademy.pricing.note = lines.join("\n");
  }

  fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
}
console.log("done");
