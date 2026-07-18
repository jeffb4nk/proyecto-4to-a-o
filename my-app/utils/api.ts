import Constants from 'expo-constants';
import { getItem, setItem, deleteItem } from '@/utils/storage';
import { getDeviceId } from '@/utils/dispositivo';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { LoginResponse, RegisterData } from '@/types/api';
import { router } from 'expo-router';

// La URL del backend se resuelve distinto segun la plataforma.
// Tambien se puede configurar desde app.json si se necesita
// apuntar a un servidor diferente sin tocar el codigo.
const getApiBaseUrl = () => {
  const configured = (Constants.expoConfig?.extra as { API_BASE_URL?: string })?.API_BASE_URL ||
    (Constants.manifest?.extra as { API_BASE_URL?: string })?.API_BASE_URL;

  if (configured) return configured;

  // En web el backend esta en localhost porque corre en la misma maquina.
  if (Platform.OS === 'web') {
    return 'http://localhost:8000';
  }

  // Expo detecta automaticamente la IP de la red donde estas.
  // Funciona en celulares reales (Expo Go) porque hostUri contiene
  // la IP del dev server, que es la misma maquina donde corre el backend.
  if (Constants.expoConfig?.hostUri) {
    const host = Constants.expoConfig.hostUri.split(':')[0];
    return `http://${host}:8000`;
  }

  // Solo para emulador Android (10.0.2.2 es un alias especial del emulador).
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }

  return 'http://127.0.0.1:8000';
};

export const API_URL = getApiBaseUrl();
const API_BASE_URL = API_URL;

// OFFLINE_MODE no es un error de verdad, es el comportamiento esperado
// cuando no hay internet. Lo silenciamos para no llenar la consola
// de mensajes que confundan al programador (o al usuario).
function logApiError(contexto: string, error: any) {
    if (error?.message === 'OFFLINE_MODE') return;
    console.error(`Error en ${contexto}:`, error);
}

// Atajo para no tener que importar storage cada vez que necesitamos
// el token de autenticacion. El token se guarda al hacer login.
export async function getToken(): Promise<string | null> {
    return await getItem('token');
}

// El backend espera el token de acceso en el header Authorization
// y el device_id en X-Device-Id para rastrear desde donde se
// conecta cada usuario. Sin device_id, el offline no funcionaria.
export async function getAuthHeaders(): Promise<Record<string, string>> {
    const token = await getToken();
    const deviceId = await getDeviceId();
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Device-Id': deviceId,
    };
}


// Intenta renovar el token automaticamente con las credenciales guardadas.
// Si funciona, guarda el nuevo token y retorna true.
// Si falla (credenciales cambiadas, usuario eliminado, etc), retorna false.
export async function reautenticar(): Promise<boolean> {
  try {
    const email = await getItem('email');
    const password = await getItem('password');
    if (!email || !password) return false;

    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) return false;
    const data = await response.json();
    await setItem('token', data.token_acceso);
    return true;
  } catch {
    return false;
  }
}

// Antes de cualquier peticion al backend revisamos si hay internet.
// Si no hay, devolvemos una respuesta falsa que el resto del codigo
// interpreta como OFFLINE_MODE. Asi evitamos que las peticiones
// fallen con errores de red dificiles de manejar.
async function safeFetch(url: string, options: RequestInit = {}) {
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
        return {
            ok: false,
            status: 0,
            isOffline: true,
            headers: new Headers(),
            json: async () => ({ detail: 'No hay conexión a internet' }),
            text: async () => 'No hay conexión a internet',
        } as Response;
    }
    return fetch(url, options);
}

// Cada respuesta del backend pasa por aca para centralizar el manejo
// de errores: 401 (token expirado), 429 (rate limiting), errores de
// validacion, etc. Si el token expiro de verdad, cerramos sesion.
async function handleResponse(response: Response) {
    if ((response as any).isOffline) {
        throw new Error('OFFLINE_MODE');
    }

    const contentType = response.headers.get("content-type");
    
    if (!response.ok) {
        if (response.status === 401) {
            // Intentar renovar token automaticamente antes de cerrar sesion.
            // Esto cubre tanto token expirado como servidor reiniciado con
            // nueva clave secreta. Si funciona, la proxima llamada usara
            // el token fresco y el usuario ni se entera.
            const renovado = await reautenticar();
            if (renovado) {
                throw new Error('OFFLINE_MODE');
            }
            // No se pudo renovar: verificar si el token expiro de verdad
            const token = await getToken();
            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    const exp = payload.exp * 1000;
                    if (Date.now() >= exp) {
                        await deleteItem('token');
                        // NO borramos 'user' — el usuario sigue en la app
                        // con datos cacheados. Solo se le pide login al
                        // intentar algo que requiera auth nuevo.
                        throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
                    }
                } catch {
                    // Token inválido o no decodificable — no cerrar sesión abruptamente
                }
                throw new Error('Error de autenticación temporal. Intenta nuevamente.');
            }
            throw new Error('Sesión no iniciada.');
        }

        if (response.status === 429) {
            const errorData = await response.json().catch(() => ({ detail: '' }));
            throw new Error(errorData.detail || 'Demasiados intentos. Espera unos minutos antes de intentar nuevamente.');
        }

        // Si la respuesta es JSON, extraemos el detalle del error
        if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Error: ${response.status}`);
        } else {
            // Si es texto plano (Error 500), evitamos el error de JSON parse
            const errorText = await response.text();
            if (errorText.includes("UniqueViolation")) {
                throw new Error('El usuario ya existe en la base de datos.');
            }
            throw new Error(`Error del servidor (${response.status}): ${errorText.substring(0, 50)}`);
        }
    }

    // Si todo está bien, retornamos el JSON
    return response.json();
}

// --- FUNCIONES DE AUTENTICACIÓN ---
// Lo primero que necesita la app: que el usuario inicie sesion.
// Si no hay token, no se puede hacer casi nada.

export const login = async (email: string, password: string, tipo_usuario?: 'estudiante' | 'profesor' | 'admin'): Promise<LoginResponse> => {
    try {
        const body: any = { email, password };
        if (tipo_usuario) {
            body.tipo_usuario = tipo_usuario;
        }
        
        const response = await safeFetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('login', error);
        // Si el error es de red (Network request failed)
        if (error.message === 'Network request failed') {
            throw new Error('No se pudo conectar con el servidor. Revisa tu IP y Firewall.');
        }
        throw error;
    }
};

// Crear una cuenta nueva. El backend valida que el email no
// este repetido, que la contrasena cumpla los requisitos, etc.
export const register = async (data: RegisterData): Promise<LoginResponse> => {
    try {
        const response = await safeFetch(`${API_BASE_URL}/auth/registro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('registro', error);
        throw error;
    }
};

// --- FUNCIONES DE QUICES (MongoDB) ---
// Los quices se guardan en MongoDB porque tienen estructura variable:
// cada quiz puede tener distinta cantidad de preguntas, tipos mezclados,
// configuraciones diferentes. No encajarian bien en tablas SQL fijas.

export async function guardarQuiz(quizData: any) {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/quices/`, {
            method: 'POST',
            headers,
            body: JSON.stringify(quizData),
        });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('guardarQuiz', error);
        throw error;
    }
}

export async function listarQuices(autorId: number) {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/quices/?autor_id=${autorId}`, { headers });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('listarQuices', error);
        throw error;
    }
}

export async function obtenerQuiz(quizId: string) {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/quices/${quizId}`, { headers });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('obtenerQuiz', error);
        throw error;
    }
}

// Alias por si en algun lado se usa el nombre obtenerQuizPorId
// en vez de obtenerQuiz. Hacen exactamente lo mismo.
export async function obtenerQuizPorId(quizId: string) {
    return obtenerQuiz(quizId);
}

export async function actualizarQuiz(quizId: string, quizData: any) {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/quices/${quizId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(quizData),
        });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('actualizarQuiz', error);
        throw error;
    }
}

export async function eliminarQuiz(quizId: string) {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/quices/${quizId}`, {
            method: 'DELETE',
            headers,
        });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('eliminarQuiz', error);
        throw error;
    }
}

// --- FUNCIONES DE SESIONES ---
// Las sesiones son la forma en que los quizzes se publican.
// El profesor crea una sesion, los estudiantes se unen con un
// codigo, y ahi es donde se guardan los resultados de cada uno.

// El profesor toma un quiz de su biblioteca y lo publica como
// sesion. El backend genera un codigo de 6 digitos para que los
// estudiantes se unan. El modo de juego y la ponderacion vienen
// del quiz, no se pueden cambiar al publicar.
export async function crearSesionAsignada(sesionData: any) {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/crear-asignada`, {
            method: 'POST',
            headers,
            body: JSON.stringify(sesionData),
        });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('crearSesionAsignada', error);
        throw error;
    }
}

// El estudiante escribe un codigo de 6 digitos y el backend
// valida que la sesion exista, no haya expirado y que el
// estudiante pueda participar. Si todo bien, devuelve el quiz.
export async function unirseSesion(codigoAcceso: string, usuarioId: number, deviceId?: string) {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/unirse`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                codigo_acceso: codigoAcceso,
                id_usuario: usuarioId,
                device_id: deviceId,
            }),
        });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('unirseSesion', error);
        throw error;
    }
}

// Cuando el estudiante termina, mandamos el resultado al backend.
// Si ya habia hecho este quiz antes (repeticion), el backend no
// sobreescribe la nota anterior, solo cuenta el intento extra.
export async function enviarResultadoQuiz(resultadoData: any) {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/resultado`, {
            method: 'POST',
            headers,
            body: JSON.stringify(resultadoData),
        });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('enviarResultadoQuiz', error);
        throw error;
    }
}

// Vista general de los resultados de una sesion: cuantos
// participaron, que nota promedio sacaron, mejor y peor nota.
export async function obtenerResultadosGeneralesSesion(sesionId: number) {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/resultados-sesion/${sesionId}`, { headers });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('obtenerResultadosGeneralesSesion', error);
        throw error;
    }
}

// El estudiante consulta su propio historial: en que sesiones
// participo, que nota saco y cuantas veces lo intento.
export async function obtenerResultadosEstudiante(usuarioId: number) {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/mis-resultados/${usuarioId}`, { headers });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('obtenerResultadosEstudiante', error);
        throw error;
    }
}

// --- FUNCIONES ADICIONALES DE SESIONES PARA PROFESOR ---
// El profesor tiene mas control sobre las sesiones: listar,
// desactivar, eliminar, ver resultados detallados, etc.

// La sesion es el objeto principal que ve el profesor cuando
// lista sus sesiones publicadas. Tiene datos del quiz asociado,
// la materia, fechas, estado y estadisticas de participacion.
export interface Sesion {
    ses_id: number;
    ses_codigo_acceso: string;
    ses_id_mongo_quiz: string;
    ses_fk_materia: number;
    ses_nombre_grupo: string;
    ses_puntuacion_tipo: string;
    ses_estatus: string;
    ses_fecha_inicio: string;
    ses_fecha_fin: string;
    ses_activo: boolean;
    ses_escala_puntuacion: number;
    quiz_titulo: string;
    materia_nombre: string;
    total_participantes: number;
    total_finalizados: number;
    ses_eliminado?: boolean;
    ses_estado_display?: string;
}

// Trae todas las sesiones de un profesor, con filtro opcional
// por estatus (activo, expirado, finalizado). Usamos AbortController
// con timeout porque si el profesor tiene muchas sesiones, el
// backend puede tardar en responder.
export async function listarSesionesProfesor(idProfesor: number, estatus?: string): Promise<{ status: string; sesiones: Sesion[] }> {
    try {
        const url = estatus 
            ? `${API_BASE_URL}/sesiones/listar?id_profesor=${idProfesor}&estatus=${estatus}`
            : `${API_BASE_URL}/sesiones/listar?id_profesor=${idProfesor}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const headers = await getAuthHeaders();
        const response = await safeFetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('listarSesionesProfesor', error);
        
        if (error.name === 'AbortError') {
            throw new Error('Tiempo de espera agotado. Intenta nuevamente.');
        }
        
        if (error.message.includes('Failed to fetch')) {
            throw new Error('Error de conexión. Verifica que el servidor backend esté corriendo.');
        }
        
        throw error;
    }
}

// Version extendida de listarSesionesProfesor que incluye datos
// extra para los reportes detallados (promedios, tiempos, etc.).
export async function listarParaReportes(idProfesor: number): Promise<{ status: string; sesiones: Sesion[] }> {
    try {
        const url = `${API_BASE_URL}/sesiones/listar-para-reportes/${idProfesor}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const headers = await getAuthHeaders();
        const response = await safeFetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('listarParaReportes', error);
        
        if (error.name === 'AbortError') {
            throw new Error('Tiempo de espera agotado. Intenta nuevamente.');
        }
        
        if (error.message.includes('Failed to fetch')) {
            throw new Error('Error de conexión. Verifica que el servidor backend esté corriendo.');
        }
        
        throw error;
    }
}

// Marca la sesion como inactiva sin borrarla. Los resultados
// ya guardados se conservan, pero nadie mas puede unirse.
export async function desactivarSesion(sesionId: number, idProfesor: number): Promise<{ status: string; mensaje: string }> {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/desactivar/${sesionId}?id_profesor=${idProfesor}`, {
            method: 'PATCH',
            headers,
        });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('desactivarSesion', error);
        throw error;
    }
}

// Borrado real (soft-delete) de la sesion. Solo se puede
// eliminar si ya esta inactiva o expirada, no mientras esta activa.
export async function eliminarSesion(sesionId: number, idProfesor: number): Promise<{ status: string; mensaje: string }> {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/eliminar/${sesionId}?id_profesor=${idProfesor}`, {
            method: 'DELETE',
            headers,
        });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('eliminarSesion', error);
        throw error;
    }
}

// Resultados de una sesion con opcion de ordenar por nota,
// tiempo o nombre. El profesor usa esto para ver rankings.
export async function obtenerResultadosSesion(
    sesionId: number,
    ordenarPor: 'nota' | 'tiempo' | 'nombre' = 'nota',
    orden: 'asc' | 'desc' = 'desc'
): Promise<any> {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(
            `${API_BASE_URL}/sesiones/resultados-sesion/${sesionId}/detallado?ordenar_por=${ordenarPor}&orden=${orden}`,
            { headers }
        );
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('obtenerResultadosSesion', error);
        throw error;
    }
}

// Que respondio cada estudiante en cada pregunta de la sesion.
// Sirve para que el profesor vea en detalle donde fallaron.
export async function obtenerDetalleEstudianteSesion(
    sesionId: number,
    usuarioId: number
): Promise<any> {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(
            `${API_BASE_URL}/sesiones/${sesionId}/estudiantes/${usuarioId}/detalle`,
            { headers }
        );
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('obtenerDetalleEstudianteSesion', error);
        throw error;
    }
}

// Metricas generales del estudiante: promedio general, total de
// quizzes presentados, tiempo promedio por quiz, etc.
export async function obtenerEstadisticasEstudiante(usuarioId: number): Promise<any> {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/estadisticas/${usuarioId}`, { headers });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('obtenerEstadisticasEstudiante', error);
        throw error;
    }
}

// Logros o medallas que el estudiante ha desbloqueado: primer
// quiz completado, puntaje perfecto, velocidad, constancia, etc.
export async function obtenerLogrosEstudiante(usuarioId: number): Promise<any> {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/logros/${usuarioId}`, { headers });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('obtenerLogrosEstudiante', error);
        throw error;
    }
}

// Mientras una sesion esta en curso, el profesor puede ver
// en vivo quien ya termino y que nota lleva cada uno.
export async function obtenerResultadosTiempoReal(sesionId: number): Promise<any> {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/resultados-tiempo-real/${sesionId}`, { headers });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('obtenerResultadosTiempoReal', error);
        throw error;
    }
}

// Las sesiones a las que el estudiante puede unirse, segun las
// materias en las que esta inscrito y las fechas de cada sesion.
export async function obtenerSesionesDisponibles(usuarioId: number): Promise<any> {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/disponibles/${usuarioId}`, { headers });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('obtenerSesionesDisponibles', error);
        throw error;
    }
}

// Estadisticas de un quiz a traves de todas las sesiones donde
// se ha usado. Sirve para ver que tan dificil resulto en general.
export async function obtenerResultadosGeneralesQuiz(quizId: string): Promise<any> {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/quices/resultados-generales/${quizId}`, { headers });
        return await handleResponse(response);
    } catch (error) {
        logApiError('obtenerResultadosGeneralesQuiz', error);
        throw error;
    }
}

// Sesiones que el estudiante no ha completado pero que siguen
// dentro de su fecha valida. Le recordamos que las termine.
export async function obtenerSesionesPendientes(usuarioId: number): Promise<any> {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/sesiones/pendientes/${usuarioId}`, { headers });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('obtenerSesionesPendientes', error);
        throw error;
    }
}

// --- FUNCIONES DE MATERIAS ---
// Las materias son los cursos o asignaturas a los que pertenecen
// los quizzes y donde se inscriben los estudiantes.

export async function obtenerMateria(materiaId: number) {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/materias/${materiaId}`, { headers });
        return await handleResponse(response);
    } catch (error) {
        logApiError('obtenerMateria', error);
        throw error;
    }
}

// --- FUNCIONES DE RECUPERACIÓN DE CONTRASEÑA ---
// Por si el usuario olvida su contrasena, puede responder las
// preguntas de seguridad que configuro al registrarse.

// Este endpoint no requiere autenticacion porque justamente se
// usa cuando el usuario no puede iniciar sesion.
export async function obtenerPreguntasSeguridad(): Promise<any> {
    try {
        const response = await safeFetch(`${API_BASE_URL}/auth/preguntas-seguridad`);
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('obtenerPreguntasSeguridad', error);
        throw error;
    }
}

// El usuario configura sus preguntas de seguridad despues de
// registrarse. Cada pregunta tiene una respuesta que solo el sabe
// y servira para recuperar la cuenta si olvida la contrasena.
export async function configurarPreguntasSeguridad(preguntas: Array<{pregunta_id: number, respuesta: string}>): Promise<any> {
    try {
        const headers = await getAuthHeaders();
        const response = await safeFetch(`${API_BASE_URL}/auth/usuarios/preguntas-seguridad`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ preguntas }),
        });
        return await handleResponse(response);
    } catch (error: any) {
        logApiError('configurarPreguntasSeguridad', error);
        throw error;
    }
}
