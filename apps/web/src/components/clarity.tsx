// Microsoft Clarity: snippet oficial en <head> (heatmaps + session
// recordings), gateado por NEXT_PUBLIC_CLARITY_ID - sin la var no se
// renderiza nada (dev/staging no contaminan el proyecto). El ID no es
// secreto - viaja en el HTML servido.
// Spec: openspec/changes/add-clarity (capability web-tag-manager).
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

export function ClarityScript() {
  if (!CLARITY_ID) return null;
  return (
    <script
      type="text/javascript"
      dangerouslySetInnerHTML={{
        __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_ID}");`,
      }}
    />
  );
}
