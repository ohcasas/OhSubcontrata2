/**
 * Secciones de la pestaña "Conecta" del admin de OH:
 *  - Cuentas: quién se ha registrado en cada tipo de perfil.
 *  - Tablón / Directorio: ver lo publicado y quitar lo que no deba estar.
 *
 * El borrado lo permiten las políticas RLS que ya existen para admin
 * (publicaciones_tablon_delete_own y fichas_directorio_admin_delete).
 */
import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator, Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import BuscadorFiltros from '../../components/BuscadorFiltros';
import { coincide } from '../../utils/texto';
import { ETIQUETA_PERFIL, ROLES_RED } from '../../constants/perfiles';
import { formatearMoneda } from '../../utils/moneda';

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Chip({ texto }: { texto: string }) {
  return (
    <View className="bg-actionTint rounded-md px-2 py-0.5">
      <Text className="text-action text-[11px] font-sansBold">{texto}</Text>
    </View>
  );
}

function Contenedor({
  children,
  refrescando,
  onRefrescar,
}: {
  children: React.ReactNode;
  refrescando: boolean;
  onRefrescar: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefrescar} colors={[colors.action]} />}
    >
      {children}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------
type Cuenta = {
  id: string;
  nombre_completo: string | null;
  role: string;
  email: string | null;
  telefono: string | null;
  created_at: string;
  empresas_subcontratistas: { nombre: string } | null;
};

export function CuentasConecta() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todos');

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: errorSelect } = await supabase
      .from('profiles')
      .select('id, nombre_completo, role, email, telefono, created_at, empresas_subcontratistas(nombre)')
      .in('role', ROLES_RED)
      .order('created_at', { ascending: false });
    if (errorSelect) setError(errorSelect.message);
    else setCuentas((data as unknown as Cuenta[] | null) ?? []);
    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  if (cargando) return <Cargando />;

  const cuenta = (rol: string) => cuentas.filter((c) => c.role === rol).length;
  const opciones = [
    { clave: 'todos', etiqueta: `Todas (${cuentas.length})` },
    ...ROLES_RED.map((r) => ({ clave: r, etiqueta: `${ETIQUETA_PERFIL[r]} (${cuenta(r)})` })),
  ];
  const visibles = cuentas.filter(
    (c) =>
      (filtro === 'todos' || c.role === filtro) &&
      coincide(busqueda, c.nombre_completo, c.email, c.telefono, c.empresas_subcontratistas?.nombre),
  );

  return (
    <Contenedor
      refrescando={refrescando}
      onRefrescar={async () => {
        setRefrescando(true);
        await cargar();
        setRefrescando(false);
      }}
    >
      {error !== null && <ErrorCaja texto={error} />}
      <Text className="text-inkMuted text-xs mb-3">
        Cuentas registradas en OH Conecta. Los Oficios (subcontratistas) se gestionan en la pestaña Gremios.
      </Text>
      <BuscadorFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar por nombre, email o empresa"
        opciones={opciones}
        seleccion={filtro}
        onSeleccion={setFiltro}
      />

      {visibles.length === 0 ? (
        <Text className="text-inkMuted text-sm">
          {cuentas.length === 0 ? 'Todavía no se ha registrado nadie.' : 'Ninguna cuenta coincide con tu búsqueda.'}
        </Text>
      ) : (
        <View className="gap-2.5">
          {visibles.map((c) => (
            <View key={c.id} className="bg-surface rounded-xl border border-border p-3.5">
              <View className="flex-row justify-between items-start">
                <Text className="text-ink text-sm font-sansBold flex-1 pr-2">{c.nombre_completo ?? 'Sin nombre'}</Text>
                <Chip texto={ETIQUETA_PERFIL[c.role] ?? c.role} />
              </View>
              {c.empresas_subcontratistas !== null && c.empresas_subcontratistas.nombre !== c.nombre_completo && (
                <Text className="text-inkMuted text-xs mt-0.5">{c.empresas_subcontratistas.nombre}</Text>
              )}
              <View className="flex-row items-center flex-wrap gap-x-3 gap-y-1 mt-2 pt-2 border-t border-border">
                {c.email !== null && (
                  <Pressable onPress={() => Linking.openURL(`mailto:${c.email}`)}>
                    <Text className="text-action text-[11px] font-sansSemiBold">{c.email}</Text>
                  </Pressable>
                )}
                {c.telefono !== null && (
                  <Pressable onPress={() => Linking.openURL(`tel:${c.telefono}`)}>
                    <Text className="text-action text-[11px] font-sansSemiBold">{c.telefono}</Text>
                  </Pressable>
                )}
                <Text className="text-inkMuted text-[11px]">Alta: {fechaCorta(c.created_at)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Contenedor>
  );
}

// ---------------------------------------------------------------------------
// Tablón (moderación)
// ---------------------------------------------------------------------------
type PublicacionAdmin = {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  categoria: string | null;
  created_at: string;
  profiles: { nombre_completo: string | null; role: string } | null;
};

export function TablonModeracion() {
  const [items, setItems] = useState<PublicacionAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todos');

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: errorSelect } = await supabase
      .from('publicaciones_tablon')
      .select('id, tipo, titulo, descripcion, categoria, created_at, profiles(nombre_completo, role)')
      .order('created_at', { ascending: false });
    if (errorSelect) setError(errorSelect.message);
    else setItems((data as unknown as PublicacionAdmin[] | null) ?? []);
    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const confirmarBorrado = (p: PublicacionAdmin) => {
    Alert.alert('Quitar publicación', `¿Quitar «${p.titulo}» del Tablón? Dejará de verla todo el mundo.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          setBorrandoId(p.id);
          const { error: errorDelete } = await supabase.from('publicaciones_tablon').delete().eq('id', p.id);
          setBorrandoId(null);
          if (errorDelete) setError(errorDelete.message);
          else cargar();
        },
      },
    ]);
  };

  if (cargando) return <Cargando />;

  const visibles = items.filter(
    (p) =>
      (filtro === 'todos' || p.tipo === filtro) &&
      coincide(busqueda, p.titulo, p.descripcion, p.categoria, p.profiles?.nombre_completo),
  );

  return (
    <Contenedor
      refrescando={refrescando}
      onRefrescar={async () => {
        setRefrescando(true);
        await cargar();
        setRefrescando(false);
      }}
    >
      {error !== null && <ErrorCaja texto={error} />}
      <BuscadorFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar en el Tablón"
        opciones={[
          { clave: 'todos', etiqueta: `Todo (${items.length})` },
          { clave: 'necesidad', etiqueta: 'Necesidades' },
          { clave: 'aviso', etiqueta: 'Avisos' },
        ]}
        seleccion={filtro}
        onSeleccion={setFiltro}
      />

      {visibles.length === 0 ? (
        <Text className="text-inkMuted text-sm">
          {items.length === 0 ? 'No hay nada publicado en el Tablón.' : 'Nada coincide con tu búsqueda.'}
        </Text>
      ) : (
        <View className="gap-2.5">
          {visibles.map((p) => (
            <View key={p.id} className="bg-surface rounded-xl border border-border p-3.5">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-ink text-sm font-sansBold">{p.titulo}</Text>
                  <Text className="text-inkMuted text-xs mt-0.5">
                    {p.profiles?.nombre_completo ?? '—'} · {ETIQUETA_PERFIL[p.profiles?.role ?? ''] ?? '—'} ·{' '}
                    {fechaCorta(p.created_at)}
                  </Text>
                </View>
                {borrandoId === p.id ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Pressable onPress={() => confirmarBorrado(p)} hitSlop={8}>
                    <Feather name="trash-2" size={16} color={colors.error} />
                  </Pressable>
                )}
              </View>
              {p.descripcion !== null && (
                <Text className="text-inkMuted text-xs mt-1.5" numberOfLines={3}>
                  {p.descripcion}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </Contenedor>
  );
}

// ---------------------------------------------------------------------------
// Directorio (moderación)
// ---------------------------------------------------------------------------
type FichaAdmin = {
  profile_id: string;
  rol: string;
  nombre_mostrar: string;
  categoria: string | null;
  zona_cobertura: string | null;
  created_at: string;
};

export function DirectorioModeracion() {
  const [items, setItems] = useState<FichaAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todos');

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: errorSelect } = await supabase
      .from('fichas_directorio')
      .select('profile_id, rol, nombre_mostrar, categoria, zona_cobertura, created_at')
      .order('created_at', { ascending: false });
    if (errorSelect) setError(errorSelect.message);
    else setItems((data as FichaAdmin[] | null) ?? []);
    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const confirmarBorrado = (f: FichaAdmin) => {
    Alert.alert('Quitar ficha', `¿Quitar la ficha de «${f.nombre_mostrar}» del Directorio? La persona podrá volver a crearla.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          setBorrandoId(f.profile_id);
          const { error: errorDelete } = await supabase.from('fichas_directorio').delete().eq('profile_id', f.profile_id);
          setBorrandoId(null);
          if (errorDelete) setError(errorDelete.message);
          else cargar();
        },
      },
    ]);
  };

  if (cargando) return <Cargando />;

  const visibles = items.filter(
    (f) => (filtro === 'todos' || f.rol === filtro) && coincide(busqueda, f.nombre_mostrar, f.categoria, f.zona_cobertura),
  );

  return (
    <Contenedor
      refrescando={refrescando}
      onRefrescar={async () => {
        setRefrescando(true);
        await cargar();
        setRefrescando(false);
      }}
    >
      {error !== null && <ErrorCaja texto={error} />}
      <BuscadorFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar en el Directorio"
        opciones={[
          { clave: 'todos', etiqueta: `Todas (${items.length})` },
          { clave: 'proveedor', etiqueta: 'Proveedores' },
          { clave: 'arquitecto', etiqueta: 'Arquitectos' },
          { clave: 'profesional', etiqueta: 'Profesionales' },
        ]}
        seleccion={filtro}
        onSeleccion={setFiltro}
      />

      {visibles.length === 0 ? (
        <Text className="text-inkMuted text-sm">
          {items.length === 0 ? 'Todavía no hay fichas en el Directorio.' : 'Nada coincide con tu búsqueda.'}
        </Text>
      ) : (
        <View className="gap-2.5">
          {visibles.map((f) => (
            <View key={f.profile_id} className="bg-surface rounded-xl border border-border p-3.5 flex-row items-start">
              <View className="flex-1 pr-2">
                <View className="flex-row items-center gap-2">
                  <Text className="text-ink text-sm font-sansBold flex-shrink">{f.nombre_mostrar}</Text>
                  <Chip texto={ETIQUETA_PERFIL[f.rol] ?? f.rol} />
                </View>
                <Text className="text-inkMuted text-xs mt-0.5">
                  {[f.categoria, f.zona_cobertura].filter((x) => x !== null && x !== '').join(' · ') || 'Sin categoría ni zona'}
                </Text>
              </View>
              {borrandoId === f.profile_id ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Pressable onPress={() => confirmarBorrado(f)} hitSlop={8}>
                  <Feather name="trash-2" size={16} color={colors.error} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
    </Contenedor>
  );
}

// ---------------------------------------------------------------------------
// Comisiones de recomendación: ver qué se debe y marcar lo ya pagado
// ---------------------------------------------------------------------------
type Comision = {
  id: string;
  estado: string;
  importe: number;
  porcentaje: number;
  base_imponible: number;
  created_at: string;
  referencias_comerciales: { nombre_cliente: string } | null;
  profiles: { nombre_completo: string | null; role: string } | null;
};

const ETIQUETA_COMISION: Record<string, string> = {
  pendiente: 'Por aceptar',
  aceptada: 'Por pagar',
  pagada: 'Pagada',
  rechazada: 'Rechazada',
};

export function ComisionesConecta() {
  const [items, setItems] = useState<Comision[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagandoId, setPagandoId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('todos');

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: errorSelect } = await supabase
      .from('recompensas_referido')
      .select(
        'id, estado, importe, porcentaje, base_imponible, created_at, referencias_comerciales(nombre_cliente), profiles(nombre_completo, role)',
      )
      .order('created_at', { ascending: false });
    if (errorSelect) setError(errorSelect.message);
    else setItems((data as unknown as Comision[] | null) ?? []);
    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const confirmarPago = (c: Comision) => {
    Alert.alert(
      'Marcar como pagada',
      `¿Confirmas que ya has pagado ${formatearMoneda(c.importe)} a ${c.profiles?.nombre_completo ?? 'esta persona'}? Se le avisará por notificación.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, ya está pagada',
          onPress: async () => {
            setError(null);
            setPagandoId(c.id);
            const { error: errorRpc } = await supabase.rpc('marcar_recompensa_pagada', { p_recompensa_id: c.id });
            setPagandoId(null);
            if (errorRpc) setError(errorRpc.message);
            else cargar();
          },
        },
      ],
    );
  };

  if (cargando) return <Cargando />;

  const suma = (estado: string) =>
    items.filter((c) => c.estado === estado).reduce((acc, c) => acc + Number(c.importe), 0);
  const visibles = items.filter((c) => filtro === 'todos' || c.estado === filtro);

  return (
    <Contenedor
      refrescando={refrescando}
      onRefrescar={async () => {
        setRefrescando(true);
        await cargar();
        setRefrescando(false);
      }}
    >
      {error !== null && <ErrorCaja texto={error} />}

      <View className="flex-row gap-2.5 mb-3">
        <View className="flex-1 bg-surface border border-border rounded-xl p-3">
          <Text className="text-inkMuted text-[12px] uppercase font-sansBold">Por pagar</Text>
          <Text className="text-ink text-lg font-sansBold mt-0.5">{formatearMoneda(suma('aceptada'))}</Text>
        </View>
        <View className="flex-1 bg-surface border border-border rounded-xl p-3">
          <Text className="text-inkMuted text-[12px] uppercase font-sansBold">Por aceptar</Text>
          <Text className="text-ink text-lg font-sansBold mt-0.5">{formatearMoneda(suma('pendiente'))}</Text>
        </View>
      </View>

      <BuscadorFiltros
        busqueda=""
        onBusqueda={() => {}}
        placeholder=""
        opciones={[
          { clave: 'todos', etiqueta: `Todas (${items.length})` },
          { clave: 'pendiente', etiqueta: 'Por aceptar' },
          { clave: 'aceptada', etiqueta: 'Por pagar' },
          { clave: 'pagada', etiqueta: 'Pagadas' },
        ]}
        seleccion={filtro}
        onSeleccion={setFiltro}
        sinBusqueda
      />

      {visibles.length === 0 ? (
        <Text className="text-inkMuted text-sm">
          {items.length === 0
            ? 'Todavía no se ha generado ninguna comisión. Aparecen cuando una recomendación llega a "Venta".'
            : 'No hay comisiones en este estado.'}
        </Text>
      ) : (
        <View className="gap-2.5">
          {visibles.map((c) => (
            <View key={c.id} className="bg-surface rounded-xl border border-border p-3.5">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-ink text-sm font-sansBold">
                    {c.referencias_comerciales?.nombre_cliente ?? 'Cliente'}
                  </Text>
                  <Text className="text-inkMuted text-xs mt-0.5">
                    Para {c.profiles?.nombre_completo ?? 'una cuenta eliminada'}
                    {c.profiles !== null ? ` · ${ETIQUETA_PERFIL[c.profiles.role] ?? c.profiles.role}` : ''}
                  </Text>
                </View>
                <Text className="text-ink text-base font-sansBold">{formatearMoneda(c.importe)}</Text>
              </View>
              <Text className="text-inkMuted text-xs mt-1">
                {String(c.porcentaje).replace('.', ',')} % sobre {formatearMoneda(c.base_imponible)} · {fechaCorta(c.created_at)}
              </Text>
              <View className="flex-row items-center justify-between mt-2.5 pt-2.5 border-t border-border">
                <Chip texto={ETIQUETA_COMISION[c.estado] ?? c.estado} />
                {c.estado === 'aceptada' &&
                  (pagandoId === c.id ? (
                    <ActivityIndicator size="small" color={colors.action} />
                  ) : (
                    <Pressable onPress={() => confirmarPago(c)} className="bg-action rounded-lg px-3 py-1.5">
                      <Text className="text-white text-xs font-sansBold">Marcar como pagada</Text>
                    </Pressable>
                  ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </Contenedor>
  );
}

function Cargando() {
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator color={colors.action} />
    </View>
  );
}

function ErrorCaja({ texto }: { texto: string }) {
  return (
    <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
      <Feather name="alert-circle" size={16} color={colors.error} />
      <Text className="text-error text-sm flex-1">{texto}</Text>
    </View>
  );
}