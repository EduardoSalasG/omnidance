import { cookies } from "next/headers";
import { Landing } from "@/components/landing/Landing";
import { HomeHub } from "@/components/home/HomeHub";

// La decisión anónimo/logueado ocurre en el servidor — la landing llega
// como HTML real (LCP, SEO) y el hub nunca parpadea para anónimos.
export default function Home() {
  const hasSession = cookies().has("omnidance_session");
  return hasSession ? <HomeHub /> : <Landing />;
}
