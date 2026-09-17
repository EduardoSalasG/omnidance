import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => ({
  locale: "es-CL",
  messages: (await import("../../messages/es-CL.json")).default,
}));
