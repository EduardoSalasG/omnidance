// Google Tag Manager: snippet oficial en dos piezas - <GtmScript/> va
// lo más arriba posible en <head> y <GtmNoScript/> es el primer hijo
// de <body>. Gateado por NEXT_PUBLIC_GTM_ID: sin la var no se renderiza
// nada (dev/staging no contaminan el contenedor). El ID no es secreto -
// viaja en el HTML servido.
// Spec: openspec/changes/add-gtm (capability web-tag-manager).
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

export function GtmScript() {
  if (!GTM_ID) return null;
  // eslint-disable-next-line @next/next/next-script-for-ga -- el
  // bootstrap oficial debe correr síncrono y lo más arriba posible en
  // <head> (misma razón que THEME_BOOT_SCRIPT); next/script lo difiere.
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
      }}
    />
  );
}

export function GtmNoScript() {
  if (!GTM_ID) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
