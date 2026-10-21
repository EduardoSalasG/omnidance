import { Controller, Get, Header } from "@nestjs/common";
import { FeatureFlagsService } from "./feature-flags.service";

/**
 * GET /features - mapa público {key: enabled} de los flags de
 * funcionalidad (spec feature-flags-admin). Sin guard: los flags son
 * metadatos de producto (booleanos), no secretos. El front lo fetchea
 * una vez por sesión vía FeaturesProvider; el Cache-Control corto
 * (30s, mismo TTL que la cache del service) permite reuso en CDN/proxy
 * sin congelar un toggle reciente.
 */
@Controller("features")
export class FeaturesController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  @Header("Cache-Control", "public, max-age=30")
  map() {
    return this.flags.publicMap();
  }
}
