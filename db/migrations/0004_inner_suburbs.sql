-- Inner suburbs, approved after the first full load. Every other city stays Other
-- until it is mapped on the Regions page. Cities already mapped there are kept.
insert into city_regions (city, region) values
  ('New Olreans', 'New Orleans'),         -- misspelling in Company Contacts
  ('Denham Springs', 'Baton Rouge'),
  ('Greenwelll Springs', 'Baton Rouge'),  -- misspelling in Company Contacts
  ('Greenwell Springs', 'Baton Rouge'),
  ('Prairieville', 'Baton Rouge'),
  ('Gonzales', 'Baton Rouge'),
  ('Youngsville', 'Lafayette'),
  ('Broussard', 'Lafayette'),
  ('Scott', 'Lafayette'),
  ('Maurice', 'Lafayette'),
  ('Bush', 'Northshore')
on conflict ((lower(city))) do nothing;

select refresh_matching();
