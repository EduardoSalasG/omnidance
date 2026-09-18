import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar con tu correo",
  alternates: { canonical: "/login" },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
