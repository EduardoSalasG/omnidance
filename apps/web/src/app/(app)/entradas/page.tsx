import { redirect } from "next/navigation";

// "Mis entradas" se fusionó con la vista mios de /eventos — una sola
// superficie para ver y gestionar tickets. Links antiguos (checkout,
// retorno de pago, QR) aterrizan en la vista fusionada.
export default function EntradasPage() {
  redirect("/eventos?view=mios");
}
