import base from "../../../messages/pt-PT.json";
import p0 from "../parts/pt-PT/academyBilling.json";
import p1 from "../parts/pt-PT/academyExtras.json";
import p2 from "../parts/pt-PT/academyImport.json";
import p3 from "../parts/pt-PT/academyPay.json";
import p4 from "../parts/pt-PT/academySales.json";
import p5 from "../parts/pt-PT/academyStaff.json";
import p6 from "../parts/pt-PT/admin.json";
import p7 from "../parts/pt-PT/analytics.json";
import p8 from "../parts/pt-PT/checkout.json";
import p9 from "../parts/pt-PT/claim.json";
import p10 from "../parts/pt-PT/classes.json";
import p11 from "../parts/pt-PT/common.json";
import p12 from "../parts/pt-PT/consumer.json";
import p13 from "../parts/pt-PT/crm.json";
import p14 from "../parts/pt-PT/dj.json";
import p15 from "../parts/pt-PT/events.json";
import p16 from "../parts/pt-PT/install.json";
import p17 from "../parts/pt-PT/landing.json";
import p18 from "../parts/pt-PT/legal.json";
import p19 from "../parts/pt-PT/locales.json";
import p20 from "../parts/pt-PT/membershipCheckout.json";
import p21 from "../parts/pt-PT/navExtra.json";
import p22 from "../parts/pt-PT/payments.json";
import p23 from "../parts/pt-PT/producer.json";
import p24 from "../parts/pt-PT/profile.json";
import p25 from "../parts/pt-PT/query.json";
import p26 from "../parts/pt-PT/realtime.json";
import p27 from "../parts/pt-PT/subscriptions.json";
import p28 from "../parts/pt-PT/support.json";
import p29 from "../parts/pt-PT/survey.json";
import p30 from "../parts/pt-PT/tours.json";
import p31 from "../parts/pt-PT/venue.json";
import p32 from "../parts/pt-PT/wallet.json";
import p33 from "../parts/pt-PT/welcome.json";
import p34 from "../parts/pt-PT/cities.json";
import p35 from "../parts/pt-PT/trip.json";
import p36 from "../parts/pt-PT/pase.json";

import { mergeDict, type Dict, type DM } from "../merge";

const parts = [p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15, p16, p17, p18, p19, p20, p21, p22, p23, p24, p25, p26, p27, p28, p29, p30, p31, p32, p33, p34, p35, p36] as Dict[];

/** Catálogo pt-PT: base + parts (fallback: es-CL debajo en messages.ts). */
const catalog = parts.reduce<Dict>((acc, p) => mergeDict(acc, p), { ...base })
export default catalog as unknown as DM<typeof base, DM<typeof p0, DM<typeof p1, DM<typeof p2, DM<typeof p3, DM<typeof p4, DM<typeof p5, DM<typeof p6, DM<typeof p7, DM<typeof p8, DM<typeof p9, DM<typeof p10, DM<typeof p11, DM<typeof p12, DM<typeof p13, DM<typeof p14, DM<typeof p15, DM<typeof p16, DM<typeof p17, DM<typeof p18, DM<typeof p19, DM<typeof p20, DM<typeof p21, DM<typeof p22, DM<typeof p23, DM<typeof p24, DM<typeof p25, DM<typeof p26, DM<typeof p27, DM<typeof p28, DM<typeof p29, DM<typeof p30, DM<typeof p31, DM<typeof p32, DM<typeof p33, DM<typeof p34, DM<typeof p35, typeof p36>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>;
