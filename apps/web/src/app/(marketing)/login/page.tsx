import LoginForm from "./login-form";

// Los CTAs de registro de las landings llegan con ?mode=register — la
// promesa "crear cuenta" no debe aterrizar en un formulario de login.
export default function LoginPage({
  searchParams,
}: {
  searchParams?: { mode?: string };
}) {
  return (
    <LoginForm
      initialMode={searchParams?.mode === "register" ? "register" : undefined}
    />
  );
}
