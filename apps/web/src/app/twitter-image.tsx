// Misma card que opengraph-image: twitter:image no hereda og:image en
// varios crawlers, así que Next la emite desde su propia convención.
export {
  alt,
  size,
  contentType,
  default,
  runtime,
} from "./opengraph-image";
