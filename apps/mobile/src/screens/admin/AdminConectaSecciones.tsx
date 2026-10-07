/**
 * Secciones de la pestaña "Conecta" del admin de OH:
 *  - Cuentas: quién se ha registrado en cada tipo de perfil.
 *  - Tablón / Directorio: ver lo publicado y quitar lo que no deba estar.
 *
 * El borrado lo permiten las políticas RLS que ya existen para admin
 * (publicaciones_tablon_delete_own y fichas_directorio_admin_delete).
 */
import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, RefreshControl, ActivityIndicator, Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import BuscadorFiltros from '../../components/BuscadorFiltros';
import { coincide } from '../../utils/texto';
import { validarDocumentoFiscal } from '../../utils/documentoFiscal';
import { ETIQUETA_PERFIL, ROLES_CUENTAS } from '../../constants/perfiles';
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
type EstadoCuenta = 'pendiente' | 'verificada' | 'suspendida';

type Cuenta = {
  id: string;
  nombre_completo: string | null;
  role: string;
  email: string | null;
  telefono: string | null;
  created_at: string;
  estado_cuenta: EstadoCuenta;
  estado_cuenta_motivo: string | null;
  empresas_subcontratistas: { nombre: string; cif: string | null } | null;
};

const ESTILO_CUENTA: Record<EstadoCuenta, { fondo: string; texto: string; etiqueta: string }> = {
  pendiente: { fondo: 'bg-warningTint', texto: 'text-warning', etiqueta: 'Pendiente' },
  verificada: { fondo: 'bg-successTint', texto: 'text-success', etiqueta: 'Verificada' },
  suspendida: { fondo: 'bg-errorTint', texto: 'text-error', etiqueta: 'Suspendida' },
};

export function CuentasConecta() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('pendiente');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [trabajandoId, setTrabajandoId] = useState<string | null>(null);
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: errorSelect } = await supabase
      .from('profiles')
      .select(
        'id, nombre_completo, role, email, telefono, created_at, estado_cuenta, estado_cuenta_motivo, empresas_subcontratistas(nombre, cif)',
      )
      .in('role', ROLES_CUENTAS)
      .order('created_at', { ascending: false });
    if (errorSelect) {
      setError(errorSelect.message);
    } else {
      const lista = (data as unknown as Cuenta[] | null) ?? [];
      setCuentas(lista);
      // La primera vez, si no hay nada pendiente, se enseña todo en vez de una lista vacía.
      if (primeraCarga) {
        setFiltroEstado(lista.some((c) => c.estado_cuenta === 'pendiente') ? 'pendiente' : 'todos');
        setPrimeraCarga(false);
      }
    }
    setCargando(false);
  }, [primeraCarga]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const cambiarEstado = async (c: Cuenta, nuevo: EstadoCuenta, motivoTexto?: string) => {
    setError(null);
    setTrabajandoId(c.id);
    const { error: errorRpc } = await supabase.rpc('cambiar_estado_cuenta', {
      p_profile_id: c.id,
      p_nuevo_estado: nuevo,
      p_motivo: motivoTexto ?? null,
    });
    setTrabajandoId(null);
    if (errorRpc) {
      setError(errorRpc.message);
      return;
    }
    setRechazandoId(null);
    setMotivo('');
    await cargar();
  };

  const confirmarVerificar = (c: Cuenta) => {
    Alert.alert(
      'Verificar cuenta',
      `¿Confirmas que ${c.nombre_completo ?? 'esta cuenta'} (${ETIQUETA_PERFIL[c.role] ?? c.role}) es quien dice ser? Podrá usar toda la app.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Verificar', onPress: () => cambiarEstado(c, 'verificada') },
      ],
    );
  };

  if (cargando) return <Cargando />;

  const pendientes = cuentas.filter((c) => c.estado_cuenta === 'pendiente').length;
  const cuentaEstado = (e: EstadoCuenta) => cuentas.filter((c) => c.estado_cuenta === e).length;
  const opcionesEstado = [
    { clave: 'pendiente', etiqueta: `Pendientes (${pendientes})` },
    { clave: 'todos', etiqueta: `Todas (${cuentas.length})` },
    { clave: 'verificada', etiqueta: `Verificadas (${cuentaEstado('verificada')})` },
    { clave: 'suspendida', etiqueta: `Suspendidas (${cuentaEstado('suspendida')})` },
  ];
  const opcionesRol = [
    { clave: 'todos', etiqueta: 'Todos los perfiles' },
    ...ROLES_CUENTAS.map((r) => ({ clave: r, etiqueta: ETIQUETA_PERFIL[r] })),
  ];
  const visibles = cuentas.filter(
    (c) =>
      (filtroEstado === 'todos' || c.estado_cuenta === filtroEstado) &&
      (filtroRol === 'todos' || c.role === filtroRol) &&
      coincide(busqueda, c.nombre_completo, c.email, c.telefono, c.empresas_subcontratistas?.nombre, c.empresas_subcontratistas?.cif),
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
        Las cuentas nuevas no pueden usar la app hasta que las verifiques. Comprueba el nombre, la empresa y el CIF antes de aprobar. El indicador del CIF solo dice si el número tiene un formato correcto; no comprueba que la empresa exista.
      </Text>
      <BuscadorFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar por nombre, email, empresa o CIF"
        opciones={opcionesEstado}
        seleccion={filtroEstado}
        onSeleccion={setFiltroEstado}
      />
      <BuscadorFiltros
        busqueda=""
        onBusqueda={() => {}}
        placeholder=""
        opciones={opcionesRol}
        seleccion={filtroRol}
        onSeleccion={setFiltroRol}
        sinBusqueda
      />

      {visibles.length === 0 ? (
        <Text className="text-inkMuted text-sm">
          {cuentas.length === 0
            ? 'Todavía no se ha registrado nadie.'
            : filtroEstado === 'pendiente' && busqueda === '' && filtroRol === 'todos'
              ? 'No hay cuentas pendientes de verificar. 🎉'
              : 'Ninguna cuenta coincide con tu búsqueda.'}
        </Text>
      ) : (
        <View className="gap-2.5 mt-1">
          {visibles.map((c) => {
            const estilo = ESTILO_CUENTA[c.estado_cuenta] ?? ESTILO_CUENTA.pendiente;
            const empresa = c.empresas_subcontratistas;
            const cif = empresa?.cif?.trim() ?? '';
            const tipoDocumento = validarDocumentoFiscal(cif);
            return (
              <View key={c.id} className="bg-surface rounded-xl border border-border p-3.5">
                <View className="flex-row justify-between items-start">
                  <Text className="text-ink text-sm font-sansBold flex-1 pr-2">{c.nombre_completo ?? 'Sin nombre'}</Text>
                  <View className={`rounded-md px-2 py-0.5 ${estilo.fondo}`}>
                    <Text className={`text-[11px] font-sansBold ${estilo.texto}`}>{estilo.etiqueta}</Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-2 mt-1">
                  <Chip texto={ETIQUETA_PERFIL[c.role] ?? c.role} />
                  {empresa !== null && empresa.nombre !== c.nombre_completo && (
                    <Text className="text-inkMuted text-xs flex-1">
                      {empresa.nombre}
                      {empresa.cif !== null && empresa.cif !== '' ? ` · ${empresa.cif}` : ''}
                    </Text>
                  )}
                </View>
                {cif === '' ? (
                  <Text className="text-inkMuted text-[11px] mt-1.5">Sin CIF/NIF</Text>
                ) : tipoDocumento !== null ? (
                  <Text className="text-success text-[11px] font-sansSemiBold mt-1.5">✓ {tipoDocumento} con formato válido</Text>
                ) : (
                  <Text className="text-warning text-[11px] font-sansSemiBold mt-1.5">⚠ El CIF/NIF no tiene un formato válido: míralo con más atención</Text>
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

                {c.estado_cuenta === 'suspendida' && c.estado_cuenta_motivo !== null && (
                  <Text className="text-inkMuted text-xs mt-2">Motivo: {c.estado_cuenta_motivo}</Text>
                )}

                {rechazandoId === c.id ? (
                  <View className="mt-2.5">
                    <Text className="text-ink text-xs font-sansSemiBold mb-1">Motivo (se le enviará a la persona)</Text>
                    <View className="bg-canvas border border-border rounded-xl px-3 mb-2">
                      <TextInput
                        value={motivo}
                        onChangeText={setMotivo}
                        placeholder="Ej: no hemos podido comprobar los datos de la empresa"
                        placeholderTextColor={colors.inkSubtle}
                        className="py-2.5 text-ink"
                      />
                    </View>
                    <View className="flex-row gap-2">
                      <Pressable onPress={() => setRechazandoId(null)} className="flex-1 border border-border rounded-lg py-2 items-center">
                        <Text className="text-inkMuted text-xs font-sansSemiBold">Cancelar</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => cambiarEstado(c, 'suspendida', motivo)}
                        disabled={trabajandoId === c.id}
                        className="flex-1 bg-error rounded-lg py-2 items-center"
                      >
                        <Text className="text-white text-xs font-sansBold">
                          {c.estado_cuenta === 'pendiente' ? 'Rechazar cuenta' : 'Suspender cuenta'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View className="flex-row justify-end items-center gap-2 mt-2.5">
                    {trabajandoId === c.id && <ActivityIndicator size="small" color={colors.action} />}
                    {c.estado_cuenta !== 'suspendida' && (
                      <Pressable
                        onPress={() => {
                          setRechazandoId(c.id);
                          setMotivo('');
                        }}
                        disabled={trabajandoId === c.id}
                        className="border border-border rounded-lg px-3 py-1.5"
                      >
                        <Text className="text-error text-xs font-sansSemiBold">
                          {c.estado_cuenta === 'pendiente' ? 'Rechazar' : 'Suspender'}
                        </Text>
                      </Pressable>
                    )}
                    {c.estado_cuenta === 'pendiente' && (
                      <Pressable onPress={() => confirmarVerificar(c)} disabled={trabajandoId === c.id} className="bg-action rounded-lg px-3 py-1.5">
                        <Text className="text-white text-xs font-sansBold">Verificar</Text>
                      </Pressable>
                    )}
                    {c.estado_cuenta === 'suspendida' && (
                      <Pressable onPress={() => cambiarEstado(c, 'verificada')} disabled={trabajandoId === c.id} className="bg-action rounded-lg px-3 py-1.5">
                        <Text className="text-white text-xs font-sansBold">Reactivar</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
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