// Datos del usuario tal cual vienen del backend
export interface Usuario {
  usu_id: number;
  usu_nombre: string;
  usu_apellido: string;
  usu_email: string;
  usu_puntos_app: number; // puntos acumulados por quizzes
  usu_fk_rol: number;
  usu_activo: boolean; // si está habilitado en el sistema
  rol_nombre: string;
  usu_imagen: string | null;
}

// Lo minimo que necesita el formulario de editar perfil
export interface UsuarioEdit {
  usu_nombre: string;
  usu_apellido: string;
  usu_email: string;
  usu_fk_rol: number;
  usu_imagen: string | null;
}
