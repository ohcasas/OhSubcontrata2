-- Añade un teléfono de contacto informativo a cada postulación.
--
-- No sustituye al teléfono del perfil (empresas registradas antes de que
-- el teléfono fuera obligatorio pueden no tenerlo). Este campo se rellena
-- cada vez que una empresa postula a una obra, así que el admin siempre
-- tiene un número al que llamar para ESA obra en concreto, aunque el
-- perfil de la empresa esté incompleto.
--
-- Es puramente informativo: no se valida el formato ni se verifica por
-- SMS/llamada, solo se guarda el texto que introduce el usuario.

alter table public.postulaciones
  add column if not exists telefono_contacto text;