import { redirect } from "next/navigation";

// /academia/asistencia se eliminó: la asistencia se consulta en el
// detalle de cada clase y marcarla es del instructor desde su clase.
export default function AcademiaAsistenciaPage() {
  redirect("/academia/series");
}
