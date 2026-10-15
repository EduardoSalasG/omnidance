import LoginForm from "./login-form";

// Los CTAs de registro de las landings llegan con ?mode=register - la
// promesa "crear cuenta" no debe aterrizar en un formulario de login.
export default async function LoginPage(
  props: {
    searchParams?: Promise<{ mode?: string; next?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return (
    <LoginForm
      initialMode={searchParams?.mode === "register" ? "register" : undefined}
      next={searchParams?.next}
    />
  );
}
