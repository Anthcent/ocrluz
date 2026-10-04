export type FieldType = 'text' | 'number' | 'money' | 'date' | 'id' | 'email' | 'phone' | 'longtext';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Otras formas en que la etiqueta aparece en los documentos (para la extracción sin IA). */
  aliases?: string[];
  /** Si no se encuentra la etiqueta, usar la primera línea del documento (p. ej. el nombre del emisor). */
  firstLine?: boolean;
}

export interface DocTemplate {
  /** «acta», «cedula_estudiante»… o «custom-12» para los tipos creados por el usuario. */
  key: string;
  name: string;
  emoji: string;
  description: string;
  fields: FieldDef[];
  custom?: boolean;
  id?: number;
}

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Texto',
  longtext: 'Texto largo',
  number: 'Número',
  money: 'Importe',
  date: 'Fecha',
  id: 'Código / N.º',
  email: 'Correo',
  phone: 'Teléfono',
};

/** Campos comunes a los documentos académicos (resumen final, revisión, materia vista). */
const ACADEMIC_FIELDS: FieldDef[] = [
  { key: 'institucion', label: 'Institución', type: 'text', aliases: ['institución', 'plantel', 'unidad educativa', 'u.e.', 'liceo', 'escuela', 'colegio'], firstLine: true },
  { key: 'anio_escolar', label: 'Año escolar', type: 'text', aliases: ['año escolar', 'periodo escolar', 'período escolar', 'año lectivo'] },
  { key: 'grado', label: 'Grado / año', type: 'text', aliases: ['grado', 'curso', 'nivel'] },
  { key: 'seccion', label: 'Sección', type: 'text', aliases: ['sección', 'seccion', 'secc'] },
  { key: 'materia', label: 'Materia', type: 'text', aliases: ['materia', 'asignatura', 'área de formación', 'area de formacion', 'cátedra'] },
  { key: 'docente', label: 'Docente', type: 'text', aliases: ['docente', 'profesor', 'profesora', 'prof'] },
  { key: 'fecha', label: 'Fecha', type: 'date', aliases: ['fecha'] },
  { key: 'observaciones', label: 'Observaciones', type: 'longtext', aliases: ['observaciones', 'observación'] },
];

/** Campos de una cédula de identidad. */
const ID_CARD_FIELDS: FieldDef[] = [
  { key: 'nombres', label: 'Nombres', type: 'text', aliases: ['nombres', 'nombre', 'given names'] },
  { key: 'apellidos', label: 'Apellidos', type: 'text', aliases: ['apellidos', 'apellido', 'surname'] },
  { key: 'cedula', label: 'Número de cédula', type: 'id', aliases: ['cédula de identidad', 'cedula de identidad', 'cédula', 'cedula', 'c.i.', 'n°', 'número'] },
  { key: 'nacimiento', label: 'Fecha de nacimiento', type: 'date', aliases: ['fecha de nacimiento', 'f. nacimiento', 'nacimiento', 'date of birth'] },
  { key: 'nacionalidad', label: 'Nacionalidad', type: 'text', aliases: ['nacionalidad', 'nationality'] },
  { key: 'estado_civil', label: 'Estado civil', type: 'text', aliases: ['estado civil', 'edo. civil', 'edo civil'] },
  { key: 'expedicion', label: 'Fecha de expedición', type: 'date', aliases: ['fecha de expedición', 'expedición', 'f. expedición', 'fecha de emisión', 'emisión'] },
  { key: 'vencimiento', label: 'Fecha de vencimiento', type: 'date', aliases: ['fecha de vencimiento', 'vencimiento', 'f. vencimiento', 'válido hasta', 'caducidad'] },
];

/** Tipos de documento que vienen con la app. */
export const PRESET_TEMPLATES: DocTemplate[] = [
  {
    key: 'resumen_final',
    name: 'Resumen final',
    emoji: '📊',
    description: 'Resultados finales de un grado, sección o materia.',
    fields: ACADEMIC_FIELDS,
  },
  {
    key: 'revision',
    name: 'Revisión',
    emoji: '🔍',
    description: 'Resultados de una revisión por materia.',
    fields: ACADEMIC_FIELDS,
  },
  {
    key: 'materia_vista',
    name: 'Materia vista',
    emoji: '📚',
    description: 'Constancia de una materia cursada.',
    fields: ACADEMIC_FIELDS,
  },
  {
    key: 'acta',
    name: 'Acta',
    emoji: '📜',
    description: 'Número, fecha, participantes y acuerdos.',
    fields: [
      { key: 'tipo', label: 'Tipo de acta', type: 'text', aliases: ['tipo de acta', 'acta de'], firstLine: true },
      { key: 'numero', label: 'Número de acta', type: 'id', aliases: ['acta n', 'acta nro', 'n°', 'nro', 'número'] },
      { key: 'fecha', label: 'Fecha', type: 'date', aliases: ['fecha', 'a los', 'en la ciudad de'] },
      { key: 'lugar', label: 'Lugar', type: 'text', aliases: ['lugar', 'reunidos en', 'en la sede de'] },
      { key: 'participantes', label: 'Participantes', type: 'longtext', aliases: ['participantes', 'presentes', 'asistentes'] },
      { key: 'asunto', label: 'Asunto y acuerdos', type: 'longtext', aliases: ['asunto', 'acuerdos', 'se acordó', 'objeto'] },
    ],
  },
  {
    key: 'cedula_estudiante',
    name: 'Cédula de estudiante',
    emoji: '🪪',
    description: 'Cédula de identidad del estudiante.',
    fields: ID_CARD_FIELDS,
  },
  {
    key: 'cedula_representante',
    name: 'Cédula de representante',
    emoji: '🪪',
    description: 'Cédula de identidad del representante.',
    fields: ID_CARD_FIELDS,
  },
  {
    key: 'informe_medico',
    name: 'Informe médico',
    emoji: '🏥',
    description: 'Paciente, médico, diagnóstico e indicaciones.',
    fields: [
      { key: 'paciente', label: 'Paciente', type: 'text', aliases: ['nombre del paciente', 'paciente', 'nombre y apellido'] },
      { key: 'cedula', label: 'Cédula', type: 'id', aliases: ['cédula de identidad', 'cédula', 'cedula', 'c.i.'] },
      { key: 'fecha', label: 'Fecha', type: 'date', aliases: ['fecha'] },
      { key: 'medico', label: 'Médico', type: 'text', aliases: ['médico tratante', 'médico', 'medico', 'doctor', 'doctora', 'dr.', 'dra.'] },
      { key: 'diagnostico', label: 'Diagnóstico', type: 'longtext', aliases: ['impresión diagnóstica', 'diagnóstico', 'diagnostico', 'idx'] },
      { key: 'indicaciones', label: 'Indicaciones', type: 'longtext', aliases: ['indicaciones', 'tratamiento', 'recomendaciones', 'reposo'] },
    ],
  },
  {
    key: 'sabana_notas',
    name: 'Sábana de notas',
    emoji: '📋',
    description: 'Calificaciones de una sección por materia o lapso.',
    fields: [
      { key: 'institucion', label: 'Institución', type: 'text', aliases: ['institución', 'plantel', 'unidad educativa', 'u.e.', 'liceo', 'escuela', 'colegio'], firstLine: true },
      { key: 'anio_escolar', label: 'Año escolar', type: 'text', aliases: ['año escolar', 'periodo escolar', 'período escolar', 'año lectivo'] },
      { key: 'grado', label: 'Grado / año', type: 'text', aliases: ['grado', 'curso'] },
      { key: 'seccion', label: 'Sección', type: 'text', aliases: ['sección', 'seccion', 'secc'] },
      { key: 'materia', label: 'Materia / lapso', type: 'text', aliases: ['materia', 'asignatura', 'lapso', 'momento'] },
      { key: 'docente', label: 'Docente', type: 'text', aliases: ['docente', 'profesor', 'profesora', 'prof'] },
    ],
  },
  {
    key: 'partida_nacimiento',
    name: 'Partida de nacimiento',
    emoji: '👶',
    description: 'Acta, inscrito, fecha y lugar de nacimiento, padres.',
    fields: [
      { key: 'numero_acta', label: 'Número de acta', type: 'id', aliases: ['número de acta', 'acta número', 'acta nro', 'acta n', 'acta'] },
      { key: 'inscrito', label: 'Nombres del inscrito', type: 'text', aliases: ['nombres del inscrito', 'inscrito', 'presentado', 'nombre'] },
      { key: 'nacimiento', label: 'Fecha de nacimiento', type: 'date', aliases: ['fecha de nacimiento', 'nacido el', 'nació el', 'nacimiento'] },
      { key: 'lugar_nacimiento', label: 'Lugar de nacimiento', type: 'text', aliases: ['lugar de nacimiento', 'nacido en', 'nació en'] },
      { key: 'padre', label: 'Padre', type: 'text', aliases: ['nombre del padre', 'padre', 'hijo de', 'hija de'] },
      { key: 'madre', label: 'Madre', type: 'text', aliases: ['nombre de la madre', 'madre'] },
      { key: 'registro', label: 'Registro civil', type: 'text', aliases: ['registro civil', 'oficina de registro', 'registrador', 'parroquia', 'municipio'] },
      { key: 'inscripcion', label: 'Fecha de inscripción', type: 'date', aliases: ['fecha de inscripción', 'fecha de registro', 'inscrito el', 'inscrita el'] },
    ],
  },
  {
    key: 'ficha_inscripcion',
    name: 'Ficha de inscripción',
    emoji: '🗂️',
    description: 'Estudiante, grado, sección y representante.',
    fields: [
      { key: 'estudiante', label: 'Estudiante', type: 'text', aliases: ['nombres y apellidos', 'estudiante', 'alumno', 'alumna', 'nombre'] },
      { key: 'cedula', label: 'Cédula del estudiante', type: 'id', aliases: ['cédula del estudiante', 'cédula escolar', 'cédula', 'cedula', 'c.i.'] },
      { key: 'nacimiento', label: 'Fecha de nacimiento', type: 'date', aliases: ['fecha de nacimiento', 'nacimiento'] },
      { key: 'grado', label: 'Grado / año', type: 'text', aliases: ['grado', 'curso'] },
      { key: 'seccion', label: 'Sección', type: 'text', aliases: ['sección', 'seccion', 'secc'] },
      { key: 'representante', label: 'Representante', type: 'text', aliases: ['nombre del representante', 'representante'] },
      { key: 'cedula_representante', label: 'Cédula del representante', type: 'id', aliases: ['cédula del representante', 'c.i. del representante'] },
      { key: 'telefono', label: 'Teléfono', type: 'phone', aliases: ['teléfono', 'telf', 'tel', 'celular', 'móvil'] },
      { key: 'direccion', label: 'Dirección', type: 'longtext', aliases: ['dirección', 'direccion', 'domicilio'] },
      { key: 'periodo', label: 'Período', type: 'text', aliases: ['período escolar', 'periodo escolar', 'año escolar', 'período', 'periodo'] },
    ],
  },
  {
    key: 'nomina',
    name: 'Nómina',
    emoji: '👥',
    description: 'Listado de personas por período y dependencia.',
    fields: [
      { key: 'institucion', label: 'Institución', type: 'text', aliases: ['institución', 'plantel', 'unidad educativa', 'organismo'], firstLine: true },
      { key: 'periodo', label: 'Período', type: 'text', aliases: ['período', 'periodo', 'año escolar', 'mes', 'quincena'] },
      { key: 'dependencia', label: 'Grado, sección o dependencia', type: 'text', aliases: ['dependencia', 'departamento', 'grado', 'sección', 'seccion'] },
      { key: 'total_registros', label: 'Total de registros', type: 'number', aliases: ['total de registros', 'total de estudiantes', 'total de personas', 'matrícula', 'total'] },
      { key: 'responsable', label: 'Responsable', type: 'text', aliases: ['responsable', 'elaborado por', 'director', 'directora', 'coordinador', 'coordinadora'] },
    ],
  },
  {
    key: 'generico',
    name: 'Documento general',
    emoji: '📄',
    description: 'Datos comunes de cualquier documento.',
    fields: [
      { key: 'titulo', label: 'Título', type: 'text', aliases: ['título', 'asunto'], firstLine: true },
      { key: 'fecha', label: 'Fecha', type: 'date', aliases: ['fecha'] },
      { key: 'numero', label: 'Número', type: 'id', aliases: ['n°', 'nro', 'número', 'expediente', 'código'] },
      { key: 'monto', label: 'Monto', type: 'money', aliases: ['total', 'monto', 'importe'] },
      { key: 'email', label: 'Correo', type: 'email', aliases: ['correo', 'email', 'e-mail'] },
      { key: 'telefono', label: 'Teléfono', type: 'phone', aliases: ['teléfono', 'telf', 'tel', 'celular', 'móvil'] },
    ],
  },
];

export const DOC_EMOJIS = ['📄', '📊', '🔍', '📚', '📜', '🪪', '🏥', '📋', '👶', '🗂️', '👥', '🎓'];

/** «Fecha de pago» → «fecha_de_pago» (clave de campo segura). */
export function fieldKey(label: string) {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'campo'
  );
}
