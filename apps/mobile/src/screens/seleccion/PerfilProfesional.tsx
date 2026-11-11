import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  entrarBolsa,
  guardarPerfilProfesional,
  mensajeDeErrorSeleccion,
  miPerfilProfesional,
  salirBolsa,
  type Disponibilidad,
  type FormacionItem,
} from '../../services/seleccion';
import { Aviso, BotonPrimario, BotonSecundario, Tarjeta } from './ui';

const URL_POLITICA = 'https://3bconecta.com/privacidad.html';
const MAX_FORMACION = 20;
const DISPONIBILIDADES: { valor: Disponibilidad; texto: string }[] = [
  { valor: 'inmediata', texto: 'Inmediata' },
  { valor: 'un_mes', texto: 'En un mes' },
  { valor: 'a_consultar', texto: 'A consultar' },
];

const aLista = (t: string): string[] =>
  t
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

/**
 * «Mi perfil profesional» del candidato: oficio, experiencia, formación y certificaciones (solo declaradas,
 * sin archivos) y la bolsa de empleo. Estar en la bolsa es opcional y se puede retirar en cualquier momento.
 * Los permisos y las validaciones viven en la base de datos (migración 0078).
 */
export default function PerfilProfesional() {
  const [oficios, setOficios] = useState('');
  const [anios, setAnios] = useState('');
  const [provincias, setProvincias] = useState('');
  const [disp, setDisp] = useState<Disponibilidad | null>(null);
  const [vehiculo, setVehiculo] = useState(false);
  const [formacion, setFormacion] = useState<FormacionItem[]>([]);
  const [enBolsa, setEnBolsa] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const cargar = useCallback(() => {
    miPerfilProfesional()
      .then(({ perfil, formacion: f }) => {
        setOficios((perfil?.oficios ?? []).join(', '));
        setAnios(perfil?.anios_experiencia != null ? String(perfil.anios_experiencia) : '');
        setProvincias((perfil?.provincias ?? []).join(', '));
        setDisp(perfil?.disponibilidad ?? null);
        setVehiculo(perfil?.tiene_vehiculo ?? false);
        setEnBolsa(perfil?.en_bolsa ?? false);
        setFormacion(f);
      })
      .catch(() => undefined);
  }, []);
  useFocusEffect(cargar);

  const ejecutar = async (clave: string, f: () => Promise<string>) => {
    setOcupado(clave);
    setMsg(null);
    try {
      setMsg({ tipo: 'ok', texto: await f() });
    } catch (e) {
      setMsg({ tipo: 'error', texto: mensajeDeErrorSeleccion(e) });
    } finally {
      setOcupado(null);
    }
  };

  const datos = () => {
    const n = anios.trim() === '' ? null : Number(anios.replace(',', '.'));
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 60)) throw new Error('Los años de experiencia son un número entero de 0 a 60.');
    return {
      oficios: aLista(oficios),
      anios: n,
      provincias: aLista(provincias),
      disponibilidad: disp,
      vehiculo,
      formacion: formacion
        .filter((f) => f.nombre.trim().length > 0)
        .map((f) => ({ ...f, nombre: f.nombre.trim(), entidad: f.entidad?.trim() ? f.entidad.trim() : null })),
    };
  };

  const guardar = () =>
    ejecutar('guardar', async () => {
      await guardarPerfilProfesional(datos());
      cargar();
      return 'Perfil profesional guardado.';
    });

  const entrar = () =>
    ejecutar('entrar', async () => {
      if (!acepta) throw new Error('Marca la casilla para dar tu consentimiento.');
      await guardarPerfilProfesional(datos());
      await entrarBolsa();
      setAcepta(false);
      cargar();
      return 'Ya estás en la bolsa de empleo. Puedes salir cuando quieras.';
    });

  const salir = () =>
    ejecutar('salir', async () => {
      await salirBolsa();
      cargar();
      return 'Has salido de la bolsa de empleo.';
    });

  const cambiarFormacion = (i: number, parte: Partial<FormacionItem>) =>
    setFormacion((prev) => prev.map((f, j) => (j === i ? { ...f, ...parte } : f)));

  const caja = 'bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-3';

  return (
    <>
      <Tarjeta>
        <Text className="text-ink text-base font-sansBold">Mi perfil profesional</Text>
        <Text className="text-inkMuted text-sm mt-0.5 mb-3">
          Cuéntanos tu oficio y tu formación. Lo que indiques aquí lo escribes tú: no pedimos copias de documentos.
        </Text>
        {msg !== null && <Aviso texto={msg.texto} tipo={msg.tipo} />}

        <Text className="text-ink text-sm font-sansSemiBold mb-1">Oficios (separados por comas, hasta 5)</Text>
        <TextInput value={oficios} onChangeText={setOficios} placeholder="Encofrador, ferralla" className={caja} />
        <Text className="text-ink text-sm font-sansSemiBold mb-1">Años de experiencia</Text>
        <TextInput value={anios} onChangeText={setAnios} keyboardType="number-pad" maxLength={2} placeholder="Ej: 8" className={caja} />
        <Text className="text-ink text-sm font-sansSemiBold mb-1">Provincias donde puedes trabajar (hasta 10)</Text>
        <TextInput value={provincias} onChangeText={setProvincias} placeholder="Albacete, Cuenca" className={caja} />

        <Text className="text-ink text-sm font-sansSemiBold mb-1.5">Disponibilidad</Text>
        <View className="flex-row flex-wrap mb-3" style={{ gap: 6 }}>
          {DISPONIBILIDADES.map((d) => (
            <Pressable
              key={d.valor}
              onPress={() => setDisp(disp === d.valor ? null : d.valor)}
              accessibilityRole="button"
              className={`rounded-full px-3.5 py-2 border ${disp === d.valor ? 'bg-ink border-ink' : 'bg-surface border-border'}`}
            >
              <Text className={`text-xs font-sansSemiBold ${disp === d.valor ? 'text-white' : 'text-ink'}`}>{d.texto}</Text>
            </Pressable>
          ))}
        </View>

        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-ink text-sm font-sansSemiBold flex-1 pr-3">Tengo vehículo propio</Text>
          <Switch value={vehiculo} onValueChange={setVehiculo} />
        </View>

        <Text className="text-ink text-sm font-sansSemiBold mb-1">Cursos y certificaciones</Text>
        <Text className="text-inkMuted text-xs mb-2">
          Por ejemplo: Tarjeta Profesional de la Construcción, curso de PRL, carné de operador. Solo nombre, entidad y año.
        </Text>
        {formacion.map((f, i) => (
          <View key={i} className="border border-border rounded-xl p-3 mb-2">
            <View className="flex-row mb-2" style={{ gap: 6 }}>
              {(['certificacion', 'curso'] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => cambiarFormacion(i, { tipo: t })}
                  accessibilityRole="button"
                  className={`rounded-full px-3 py-1.5 border ${f.tipo === t ? 'bg-ink border-ink' : 'bg-surface border-border'}`}
                >
                  <Text className={`text-xs font-sansSemiBold ${f.tipo === t ? 'text-white' : 'text-ink'}`}>{t === 'curso' ? 'Curso' : 'Certificación'}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput value={f.nombre} onChangeText={(t) => cambiarFormacion(i, { nombre: t })} placeholder="Nombre" maxLength={150} className={caja} />
            <TextInput value={f.entidad ?? ''} onChangeText={(t) => cambiarFormacion(i, { entidad: t })} placeholder="Entidad (opcional)" maxLength={150} className={caja} />
            <TextInput
              value={f.anio != null ? String(f.anio) : ''}
              onChangeText={(t) => cambiarFormacion(i, { anio: /^\d{4}$/.test(t.trim()) ? Number(t.trim()) : null })}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="Año (opcional)"
              className={caja}
            />
            <Pressable onPress={() => setFormacion((prev) => prev.filter((_, j) => j !== i))} accessibilityRole="button" hitSlop={8}>
              <Text className="text-error text-sm font-sansSemiBold">Quitar</Text>
            </Pressable>
          </View>
        ))}
        {formacion.length < MAX_FORMACION && (
          <View className="mb-3">
            <BotonSecundario texto="Añadir curso o certificación" onPress={() => setFormacion((prev) => [...prev, { tipo: 'certificacion', nombre: '', entidad: null, anio: null }])} />
          </View>
        )}

        <BotonPrimario texto="Guardar perfil profesional" onPress={guardar} cargando={ocupado === 'guardar'} />
      </Tarjeta>

      <Tarjeta>
        <Text className="text-ink text-base font-sansBold">Bolsa de empleo</Text>
        {enBolsa ? (
          <>
            <Text className="text-inkMuted text-sm mt-0.5 mb-3">
              Estás en la bolsa. El equipo de selección de 3B puede consultar tu perfil para ofrecerte futuras oportunidades. Puedes salir
              cuando quieras.
            </Text>
            <BotonSecundario texto="Salir de la bolsa" onPress={salir} desactivado={ocupado === 'salir'} />
          </>
        ) : (
          <>
            <Text className="text-inkMuted text-sm mt-0.5 mb-3">
              Es opcional. Si entras, el equipo de selección podrá consultar tu perfil para ofrecerte futuras oportunidades, aunque no haya una
              oferta abierta. Para entrar necesitas indicar al menos un oficio.
            </Text>
            <View className="flex-row items-start gap-3 mb-3">
              <Switch value={acepta} onValueChange={setAcepta} />
              <Text className="text-ink text-xs flex-1 leading-relaxed">
                Autorizo a 3B GROUP ARQUITECTURA, S.L.U. a conservar mi perfil profesional y mis datos de contacto en su bolsa de empleo y a que su
                equipo de selección los consulte para ofrecerme futuras oportunidades, aunque no haya una oferta abierta. Ninguna decisión de
                contratación se toma de forma automática. Puedo salir de la bolsa cuando quiera. Más información en la{' '}
                <Text className="text-action font-sansSemiBold" onPress={() => Linking.openURL(URL_POLITICA)}>
                  política de privacidad
                </Text>
                .
              </Text>
            </View>
            <BotonPrimario texto="Entrar en la bolsa" onPress={entrar} cargando={ocupado === 'entrar'} desactivado={!acepta} />
          </>
        )}
      </Tarjeta>
    </>
  );
}