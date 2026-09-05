-- Seed data for local development.
--
-- The restaurant_items rows below are ILLUSTRATIVE PLACEHOLDERS with invented
-- figures, marked as such. Design doc §12: real chain nutrition data must be
-- sourced chain-by-chain, checking that each publishes it and that their terms
-- allow use, with the source URL and check date recorded. Do not ship these
-- numbers to anyone; replace them with verified data first.

insert into public.foods
  (barcode, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, fibre_100g, serving_g, source)
values
  ('5099073000191', 'Porridge Oats', 'Flahavan''s', 372, 11.0, 60.0, 8.0, 9.0, 40, 'override'),
  ('5000108000000', 'Semi-Skimmed Milk', 'Avonmore', 50, 3.5, 4.8, 1.8, 0, 200, 'override')
on conflict (barcode, source) do nothing;

insert into public.restaurant_items
  (restaurant_name, item_name, kcal, protein_g, carbs_g, fat_g, fibre_g, source_url, checked_at)
values
  ('PLACEHOLDER Cafe', 'Chicken curry with rice', 690, 30, 80, 20, 5, null, null),
  ('PLACEHOLDER Cafe', 'Chicken fillet roll', 620, 32, 68, 22, 4, null, null)
on conflict (restaurant_name, item_name) do nothing;
