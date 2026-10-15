import base from "../../../messages/es-CL.json";
import p0 from "../parts/academyBilling.json";
import p1 from "../parts/academyExtras.json";
import p2 from "../parts/academyImport.json";
import p3 from "../parts/academyPay.json";
import p4 from "../parts/academySales.json";
import p5 from "../parts/academyStaff.json";
import p6 from "../parts/admin.json";
import p7 from "../parts/analytics.json";
import p8 from "../parts/checkout.json";
import p9 from "../parts/claim.json";
import p10 from "../parts/classes.json";
import p11 from "../parts/common.json";
import p12 from "../parts/consumer.json";
import p13 from "../parts/crm.json";
import p14 from "../parts/dj.json";
import p15 from "../parts/events.json";
import p16 from "../parts/install.json";
import p17 from "../parts/landing.json";
import p18 from "../parts/legal.json";
import p19 from "../parts/locales.json";
import p20 from "../parts/membershipCheckout.json";
import p21 from "../parts/navExtra.json";
import p22 from "../parts/payments.json";
import p23 from "../parts/producer.json";
import p24 from "../parts/profile.json";
import p25 from "../parts/query.json";
import p26 from "../parts/realtime.json";
import p27 from "../parts/subscriptions.json";
import p28 from "../parts/support.json";
import p29 from "../parts/survey.json";
import p30 from "../parts/tours.json";
import p31 from "../parts/venue.json";
import p32 from "../parts/wallet.json";
import p33 from "../parts/welcome.json";

import { mergeDict, type Dict, type DM } from "../merge";

const parts = [p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15, p16, p17, p18, p19, p20, p21, p22, p23, p24, p25, p26, p27, p28, p29, p30, p31, p32, p33] as Dict[];

/** Catálogo es-CL: base + parts (fallback: es-CL debajo en messages.ts). */
const catalog = parts.reduce<Dict>((acc, p) => mergeDict(acc, p), { ...base })
export default catalog as unknown as DM<typeof base, DM<typeof p0, DM<typeof p1, DM<typeof p2, DM<typeof p3, DM<typeof p4, DM<typeof p5, DM<typeof p6, DM<typeof p7, DM<typeof p8, DM<typeof p9, DM<typeof p10, DM<typeof p11, DM<typeof p12, DM<typeof p13, DM<typeof p14, DM<typeof p15, DM<typeof p16, DM<typeof p17, DM<typeof p18, DM<typeof p19, DM<typeof p20, DM<typeof p21, DM<typeof p22, DM<typeof p23, DM<typeof p24, DM<typeof p25, DM<typeof p26, DM<typeof p27, DM<typeof p28, DM<typeof p29, DM<typeof p30, DM<typeof p31, DM<typeof p32, typeof p33>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>;
