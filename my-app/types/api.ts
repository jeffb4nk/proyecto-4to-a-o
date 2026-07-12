// Lo que devuelve el backend al iniciar sesion
export interface LoginResponse {
    token_acceso: string;
    usuario: {
        usu_id: number;
        usu_nombre: string;
        usu_apellido: string;
        usu_email: string;
        usu_puntos_app: number;
        usu_fk_rol: number;
        usu_activo: boolean;
        rol_nombre: string;
        usu_imagen: string | null;
    };
}

// Lo que manda el formulario de registro
export interface RegisterData {
    nombre: string;
    apellido: string;
    email: string;
    password: string;
    tipo: 'estudiante' | 'profesor';
    imagen?: string;
}