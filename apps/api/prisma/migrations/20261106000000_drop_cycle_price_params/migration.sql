-- cycle-pricing: el cobro del ciclo se calcula del mensual base
-- (semestral x5.75, anual x11) - los params *_semiannual_clp /
-- *_annual_clp quedan obsoletos y se eliminan para no inducir a error
-- en /admin/params.
DELETE FROM "PlatformParam"
WHERE key IN (
  'academy_tier.starter_semiannual_clp',
  'academy_tier.starter_annual_clp',
  'academy_tier.pro_semiannual_clp',
  'academy_tier.pro_annual_clp',
  'academy_tier.studio_semiannual_clp',
  'academy_tier.studio_annual_clp',
  'producer_tier.starter_semiannual_clp',
  'producer_tier.starter_annual_clp',
  'producer_tier.growth_semiannual_clp',
  'producer_tier.growth_annual_clp'
);
