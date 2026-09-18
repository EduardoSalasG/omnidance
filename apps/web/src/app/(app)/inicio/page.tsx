import type { Metadata } from "next";
import { HomeHub } from "@/components/home/HomeHub";

export const metadata: Metadata = {
  title: "Inicio",
  alternates: { canonical: "/inicio" },
};

export default function Inicio() {
  return <HomeHub />;
}
