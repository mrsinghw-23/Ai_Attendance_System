--
-- PostgreSQL database dump
--

\restrict caDfK53LPiJ7uVxMfpTPrgfDfm4WpneJb4ijh87RU6BjLklcdu2IhxtvibTBEfe

-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_recognition_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_recognition_events (
    id integer NOT NULL,
    camera_id integer,
    event_type character varying(50) NOT NULL,
    message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: ai_recognition_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_recognition_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_recognition_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_recognition_events_id_seq OWNED BY public.ai_recognition_events.id;


--
-- Name: ai_recognition_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_recognition_stats (
    id integer NOT NULL,
    stat_date date DEFAULT CURRENT_DATE NOT NULL,
    faces_detected integer DEFAULT 0,
    faces_recognized integer DEFAULT 0,
    unknown_faces integer DEFAULT 0,
    attendance_generated integer DEFAULT 0,
    active_cameras integer DEFAULT 0,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE ai_recognition_stats; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_recognition_stats IS 'Daily AI recognition counters for dashboard widgets';


--
-- Name: ai_recognition_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_recognition_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_recognition_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_recognition_stats_id_seq OWNED BY public.ai_recognition_stats.id;


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    employee_id integer,
    camera_id integer,
    attendance_date date,
    check_in_time timestamp without time zone,
    status character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: attendance_engine_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_engine_runs (
    id integer NOT NULL,
    run_type character varying(40) DEFAULT 'PROCESS_FACE_EVENTS'::character varying NOT NULL,
    status character varying(20) DEFAULT 'RUNNING'::character varying NOT NULL,
    events_processed integer DEFAULT 0,
    records_updated integer DEFAULT 0,
    summaries_updated integer DEFAULT 0,
    error_message text,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone
);


--
-- Name: attendance_engine_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_engine_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_engine_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_engine_runs_id_seq OWNED BY public.attendance_engine_runs.id;


--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: attendance_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_logs (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    location_id integer,
    event_type character varying(30) NOT NULL,
    event_time timestamp without time zone NOT NULL,
    source character varying(40) DEFAULT 'MANUAL'::character varying NOT NULL,
    camera_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: attendance_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_logs_id_seq OWNED BY public.attendance_logs.id;


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    location_id integer,
    attendance_date date NOT NULL,
    check_in timestamp without time zone,
    check_out timestamp without time zone,
    working_hours numeric(6,2) DEFAULT 0,
    overtime_hours numeric(6,2) DEFAULT 0,
    status character varying(30) DEFAULT 'PRESENT'::character varying,
    late_minutes integer DEFAULT 0,
    early_exit_minutes integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    total_inside_minutes integer DEFAULT 0,
    total_outside_minutes integer DEFAULT 0,
    working_minutes integer DEFAULT 0,
    overtime_minutes integer DEFAULT 0,
    entries integer DEFAULT 0,
    exits integer DEFAULT 0,
    attendance_status character varying(20)
);


--
-- Name: attendance_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_records_id_seq OWNED BY public.attendance_records.id;


--
-- Name: attendance_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_summary (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    attendance_date date NOT NULL,
    check_in timestamp without time zone,
    check_out timestamp without time zone,
    working_hours numeric(6,2) DEFAULT 0,
    total_inside_minutes integer DEFAULT 0,
    total_outside_minutes integer DEFAULT 0,
    working_minutes integer DEFAULT 0,
    overtime_minutes integer DEFAULT 0,
    outside_duration integer DEFAULT 0,
    entries integer DEFAULT 0,
    exits integer DEFAULT 0,
    attendance_status character varying(20) DEFAULT 'ABSENT'::character varying,
    late_minutes integer DEFAULT 0,
    location_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: attendance_summary_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_summary_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_summary_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_summary_id_seq OWNED BY public.attendance_summary.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer,
    username character varying(150),
    action character varying(100) NOT NULL,
    entity_type character varying(80),
    entity_id character varying(80),
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address character varying(80),
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: camera_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.camera_events (
    id integer NOT NULL,
    camera_id integer NOT NULL,
    event_type character varying(50) NOT NULL,
    message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE camera_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.camera_events IS 'Camera operational events: motion, offline, stream errors, AI links';


--
-- Name: camera_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.camera_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: camera_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.camera_events_id_seq OWNED BY public.camera_events.id;


--
-- Name: camera_health_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.camera_health_logs (
    id integer NOT NULL,
    camera_id integer NOT NULL,
    health_status character varying(20) NOT NULL,
    latency_ms integer,
    checked_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    message text,
    camera_reachable boolean DEFAULT false,
    rtsp_reachable boolean DEFAULT false,
    stream_available boolean DEFAULT false,
    diagnostics jsonb DEFAULT '{}'::jsonb
);


--
-- Name: camera_health_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.camera_health_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: camera_health_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.camera_health_logs_id_seq OWNED BY public.camera_health_logs.id;


--
-- Name: camera_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.camera_zones (
    id integer NOT NULL,
    zone_name character varying(150) NOT NULL,
    location_id integer,
    description text,
    floor character varying(50),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE camera_zones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.camera_zones IS 'Physical zones within locations for camera grouping';


--
-- Name: camera_zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.camera_zones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: camera_zones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.camera_zones_id_seq OWNED BY public.camera_zones.id;


--
-- Name: cameras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cameras (
    id integer NOT NULL,
    camera_name character varying(100),
    camera_ip character varying(100),
    location_id integer,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    rtsp_url text,
    health_status character varying(20) DEFAULT 'UNKNOWN'::character varying,
    last_seen timestamp without time zone,
    recording_status character varying(20) DEFAULT 'NOT_RECORDING'::character varying,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    camera_code character varying(50),
    camera_type character varying(50),
    brand character varying(100),
    model character varying(100),
    serial_number character varying(100),
    port integer,
    rtsp_username character varying(150),
    rtsp_password_enc text,
    zone_id integer,
    floor character varying(50),
    entry_exit_type character varying(20) DEFAULT 'NONE'::character varying,
    installation_date date,
    warranty_date date,
    motion_enabled boolean DEFAULT false,
    motion_sensitivity integer DEFAULT 50,
    last_motion_detected timestamp without time zone,
    http_port integer DEFAULT 80,
    rtsp_channel integer DEFAULT 1,
    rtsp_subtype integer DEFAULT 0,
    firmware character varying(120),
    onvif_version character varying(50),
    last_diagnostics jsonb DEFAULT '{}'::jsonb,
    reconnect_count integer DEFAULT 0
);


--
-- Name: COLUMN cameras.rtsp_password_enc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cameras.rtsp_password_enc IS 'AES-256-GCM encrypted RTSP password; never store plain text';


--
-- Name: cameras_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cameras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cameras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cameras_id_seq OWNED BY public.cameras.id;


--
-- Name: employee_face_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_face_images (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    face_profile_id integer NOT NULL,
    image_path text NOT NULL,
    image_type character varying(30) NOT NULL,
    quality_score numeric(6,3) DEFAULT 0,
    quality_metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employee_face_images_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_face_images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_face_images_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_face_images_id_seq OWNED BY public.employee_face_images.id;


--
-- Name: employee_face_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_face_profiles (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    profile_status character varying(30) DEFAULT 'PENDING'::character varying,
    image_count integer DEFAULT 0,
    embedding_model character varying(120),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    registration_date date,
    active boolean DEFAULT true
);


--
-- Name: employee_face_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_face_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_face_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_face_profiles_id_seq OWNED BY public.employee_face_profiles.id;


--
-- Name: employee_presence_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_presence_logs (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    camera_id integer,
    location_id integer,
    event_type character varying(10) NOT NULL,
    event_time timestamp without time zone NOT NULL,
    source character varying(40) DEFAULT 'AI_FACE_RECOGNITION'::character varying NOT NULL,
    face_event_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT employee_presence_logs_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['IN'::character varying, 'OUT'::character varying])::text[])))
);


--
-- Name: employee_presence_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_presence_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_presence_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_presence_logs_id_seq OWNED BY public.employee_presence_logs.id;


--
-- Name: employee_presence_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_presence_state (
    employee_id integer NOT NULL,
    attendance_date date NOT NULL,
    is_inside boolean DEFAULT false,
    last_seen_at timestamp without time zone,
    last_camera_id integer,
    last_location_id integer,
    check_in_set boolean DEFAULT false
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    employee_code character varying(20),
    name character varying(100),
    department character varying(100),
    location character varying(100),
    email character varying(100),
    mobile character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    first_name character varying(100),
    last_name character varying(100),
    designation character varying(100),
    location_id integer,
    reporting_manager_id integer,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    joining_date date,
    photo_url text,
    face_registration_status character varying(30) DEFAULT 'NOT_REGISTERED'::character varying,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: face_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.face_embeddings (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    face_profile_id integer,
    embedding_version character varying(50) DEFAULT 'v1'::character varying,
    embedding_data text,
    generated_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    source_image_id integer,
    model_name character varying(120),
    dimensions integer
);


--
-- Name: TABLE face_embeddings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.face_embeddings IS 'Architecture-ready storage for future embedding generation; not populated yet';


--
-- Name: face_embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.face_embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: face_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.face_embeddings_id_seq OWNED BY public.face_embeddings.id;


--
-- Name: face_embeddings_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.face_embeddings_metadata (
    id integer NOT NULL,
    face_profile_id integer NOT NULL,
    embedding_ref text NOT NULL,
    model_name character varying(120),
    vector_dimensions integer,
    quality_score numeric(6,3),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: face_embeddings_metadata_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.face_embeddings_metadata_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: face_embeddings_metadata_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.face_embeddings_metadata_id_seq OWNED BY public.face_embeddings_metadata.id;


--
-- Name: face_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.face_events (
    id integer NOT NULL,
    camera_id integer,
    employee_id integer,
    location_id integer,
    event_time timestamp without time zone NOT NULL,
    confidence numeric(6,3),
    event_type character varying(50) DEFAULT 'FACE_DETECTED'::character varying,
    image_ref text,
    embedding_ref text,
    metadata jsonb DEFAULT '{}'::jsonb,
    processed boolean DEFAULT false,
    attendance_log_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: face_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.face_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: face_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.face_events_id_seq OWNED BY public.face_events.id;


--
-- Name: face_registration_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.face_registration_audit_log (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    face_profile_id integer,
    session_id character varying(64) NOT NULL,
    event_type character varying(50) NOT NULL,
    image_type character varying(30),
    quality_score numeric(6,3),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE face_registration_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.face_registration_audit_log IS 'Audit trail for manual and live face registration sessions';


--
-- Name: face_registration_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.face_registration_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: face_registration_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.face_registration_audit_log_id_seq OWNED BY public.face_registration_audit_log.id;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id integer NOT NULL,
    location_name character varying(100),
    city character varying(100),
    state character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.locations_id_seq OWNED BY public.locations.id;


--
-- Name: login_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_history (
    id integer NOT NULL,
    user_id integer,
    username character varying(150),
    event_type character varying(50) NOT NULL,
    status character varying(30) NOT NULL,
    ip_address character varying(80),
    browser character varying(120),
    device character varying(120),
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: login_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_history_id_seq OWNED BY public.login_history.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer,
    role character varying(50),
    title character varying(180) NOT NULL,
    message text NOT NULL,
    type character varying(50) DEFAULT 'SYSTEM'::character varying,
    priority character varying(20) DEFAULT 'NORMAL'::character varying,
    read_at timestamp without time zone,
    entity_type character varying(80),
    entity_id character varying(80),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(128) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id integer NOT NULL,
    module character varying(50) NOT NULL,
    action character varying(50) NOT NULL,
    code character varying(100) NOT NULL,
    description text
);


--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id integer NOT NULL,
    permission_id integer NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_system boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id integer NOT NULL,
    category character varying(80) NOT NULL,
    setting_key character varying(120) NOT NULL,
    setting_value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


--
-- Name: unknown_faces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unknown_faces (
    id integer NOT NULL,
    camera_id integer,
    location_id integer,
    image_path text NOT NULL,
    confidence numeric(6,3),
    metadata jsonb DEFAULT '{}'::jsonb,
    detected_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE unknown_faces; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.unknown_faces IS 'Unrecognized faces captured from live camera streams';


--
-- Name: unknown_faces_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unknown_faces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unknown_faces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unknown_faces_id_seq OWNED BY public.unknown_faces.id;


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_permissions (
    user_id integer NOT NULL,
    permission_id integer NOT NULL,
    granted boolean DEFAULT true
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(100),
    password character varying(255),
    role character varying(20),
    employee_id integer,
    location_id integer,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    last_login_at timestamp without time zone,
    password_changed_at timestamp without time zone,
    password_reset_required boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    full_name character varying(200),
    email character varying(200),
    mobile character varying(30),
    department character varying(120),
    profile_image text
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: ai_recognition_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_recognition_events ALTER COLUMN id SET DEFAULT nextval('public.ai_recognition_events_id_seq'::regclass);


--
-- Name: ai_recognition_stats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_recognition_stats ALTER COLUMN id SET DEFAULT nextval('public.ai_recognition_stats_id_seq'::regclass);


--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: attendance_engine_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_engine_runs ALTER COLUMN id SET DEFAULT nextval('public.attendance_engine_runs_id_seq'::regclass);


--
-- Name: attendance_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_logs ALTER COLUMN id SET DEFAULT nextval('public.attendance_logs_id_seq'::regclass);


--
-- Name: attendance_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records ALTER COLUMN id SET DEFAULT nextval('public.attendance_records_id_seq'::regclass);


--
-- Name: attendance_summary id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_summary ALTER COLUMN id SET DEFAULT nextval('public.attendance_summary_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: camera_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_events ALTER COLUMN id SET DEFAULT nextval('public.camera_events_id_seq'::regclass);


--
-- Name: camera_health_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_health_logs ALTER COLUMN id SET DEFAULT nextval('public.camera_health_logs_id_seq'::regclass);


--
-- Name: camera_zones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_zones ALTER COLUMN id SET DEFAULT nextval('public.camera_zones_id_seq'::regclass);


--
-- Name: cameras id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cameras ALTER COLUMN id SET DEFAULT nextval('public.cameras_id_seq'::regclass);


--
-- Name: employee_face_images id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_face_images ALTER COLUMN id SET DEFAULT nextval('public.employee_face_images_id_seq'::regclass);


--
-- Name: employee_face_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_face_profiles ALTER COLUMN id SET DEFAULT nextval('public.employee_face_profiles_id_seq'::regclass);


--
-- Name: employee_presence_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_presence_logs ALTER COLUMN id SET DEFAULT nextval('public.employee_presence_logs_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: face_embeddings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_embeddings ALTER COLUMN id SET DEFAULT nextval('public.face_embeddings_id_seq'::regclass);


--
-- Name: face_embeddings_metadata id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_embeddings_metadata ALTER COLUMN id SET DEFAULT nextval('public.face_embeddings_metadata_id_seq'::regclass);


--
-- Name: face_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_events ALTER COLUMN id SET DEFAULT nextval('public.face_events_id_seq'::regclass);


--
-- Name: face_registration_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_registration_audit_log ALTER COLUMN id SET DEFAULT nextval('public.face_registration_audit_log_id_seq'::regclass);


--
-- Name: locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations ALTER COLUMN id SET DEFAULT nextval('public.locations_id_seq'::regclass);


--
-- Name: login_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_history ALTER COLUMN id SET DEFAULT nextval('public.login_history_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


--
-- Name: unknown_faces id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unknown_faces ALTER COLUMN id SET DEFAULT nextval('public.unknown_faces_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: ai_recognition_events ai_recognition_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_recognition_events
    ADD CONSTRAINT ai_recognition_events_pkey PRIMARY KEY (id);


--
-- Name: ai_recognition_stats ai_recognition_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_recognition_stats
    ADD CONSTRAINT ai_recognition_stats_pkey PRIMARY KEY (id);


--
-- Name: ai_recognition_stats ai_recognition_stats_stat_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_recognition_stats
    ADD CONSTRAINT ai_recognition_stats_stat_date_key UNIQUE (stat_date);


--
-- Name: attendance_engine_runs attendance_engine_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_engine_runs
    ADD CONSTRAINT attendance_engine_runs_pkey PRIMARY KEY (id);


--
-- Name: attendance_logs attendance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_employee_id_attendance_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_employee_id_attendance_date_key UNIQUE (employee_id, attendance_date);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: attendance_summary attendance_summary_employee_id_attendance_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_summary
    ADD CONSTRAINT attendance_summary_employee_id_attendance_date_key UNIQUE (employee_id, attendance_date);


--
-- Name: attendance_summary attendance_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_summary
    ADD CONSTRAINT attendance_summary_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: camera_events camera_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_events
    ADD CONSTRAINT camera_events_pkey PRIMARY KEY (id);


--
-- Name: camera_health_logs camera_health_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_health_logs
    ADD CONSTRAINT camera_health_logs_pkey PRIMARY KEY (id);


--
-- Name: camera_zones camera_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_zones
    ADD CONSTRAINT camera_zones_pkey PRIMARY KEY (id);


--
-- Name: cameras cameras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cameras
    ADD CONSTRAINT cameras_pkey PRIMARY KEY (id);


--
-- Name: employee_face_images employee_face_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_face_images
    ADD CONSTRAINT employee_face_images_pkey PRIMARY KEY (id);


--
-- Name: employee_face_profiles employee_face_profiles_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_face_profiles
    ADD CONSTRAINT employee_face_profiles_employee_id_key UNIQUE (employee_id);


--
-- Name: employee_face_profiles employee_face_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_face_profiles
    ADD CONSTRAINT employee_face_profiles_pkey PRIMARY KEY (id);


--
-- Name: employee_presence_logs employee_presence_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_presence_logs
    ADD CONSTRAINT employee_presence_logs_pkey PRIMARY KEY (id);


--
-- Name: employee_presence_state employee_presence_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_presence_state
    ADD CONSTRAINT employee_presence_state_pkey PRIMARY KEY (employee_id, attendance_date);


--
-- Name: employees employees_employee_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employee_code_key UNIQUE (employee_code);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: face_embeddings_metadata face_embeddings_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_embeddings_metadata
    ADD CONSTRAINT face_embeddings_metadata_pkey PRIMARY KEY (id);


--
-- Name: face_embeddings face_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_embeddings
    ADD CONSTRAINT face_embeddings_pkey PRIMARY KEY (id);


--
-- Name: face_events face_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_events
    ADD CONSTRAINT face_events_pkey PRIMARY KEY (id);


--
-- Name: face_registration_audit_log face_registration_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_registration_audit_log
    ADD CONSTRAINT face_registration_audit_log_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: login_history login_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_history
    ADD CONSTRAINT login_history_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- Name: permissions permissions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_code_key UNIQUE (code);


--
-- Name: permissions permissions_module_action_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_module_action_key UNIQUE (module, action);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_code_key UNIQUE (code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_category_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_category_setting_key_key UNIQUE (category, setting_key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: unknown_faces unknown_faces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unknown_faces
    ADD CONSTRAINT unknown_faces_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (user_id, permission_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_ai_recognition_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_recognition_events_created_at ON public.ai_recognition_events USING btree (created_at);


--
-- Name: idx_attendance_engine_runs_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_engine_runs_started ON public.attendance_engine_runs USING btree (started_at);


--
-- Name: idx_attendance_logs_camera_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_logs_camera_id ON public.attendance_logs USING btree (camera_id);


--
-- Name: idx_attendance_logs_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_logs_employee_id ON public.attendance_logs USING btree (employee_id);


--
-- Name: idx_attendance_logs_event_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_logs_event_time ON public.attendance_logs USING btree (event_time);


--
-- Name: idx_attendance_logs_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_logs_location_id ON public.attendance_logs USING btree (location_id);


--
-- Name: idx_attendance_records_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_records_date ON public.attendance_records USING btree (attendance_date);


--
-- Name: idx_attendance_records_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_records_employee_id ON public.attendance_records USING btree (employee_id);


--
-- Name: idx_attendance_records_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_records_location_id ON public.attendance_records USING btree (location_id);


--
-- Name: idx_attendance_records_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_records_status ON public.attendance_records USING btree (status);


--
-- Name: idx_attendance_summary_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_summary_date ON public.attendance_summary USING btree (attendance_date);


--
-- Name: idx_attendance_summary_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_summary_employee_id ON public.attendance_summary USING btree (employee_id);


--
-- Name: idx_attendance_summary_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_summary_status ON public.attendance_summary USING btree (attendance_status);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_entity_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs USING btree (entity_type);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_camera_events_camera_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_camera_events_camera_id ON public.camera_events USING btree (camera_id);


--
-- Name: idx_camera_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_camera_events_created_at ON public.camera_events USING btree (created_at);


--
-- Name: idx_camera_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_camera_events_type ON public.camera_events USING btree (event_type);


--
-- Name: idx_camera_health_logs_camera_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_camera_health_logs_camera_id ON public.camera_health_logs USING btree (camera_id);


--
-- Name: idx_camera_health_logs_checked_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_camera_health_logs_checked_at ON public.camera_health_logs USING btree (checked_at);


--
-- Name: idx_camera_zones_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_camera_zones_location ON public.camera_zones USING btree (location_id);


--
-- Name: idx_camera_zones_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_camera_zones_status ON public.camera_zones USING btree (status);


--
-- Name: idx_cameras_camera_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cameras_camera_code ON public.cameras USING btree (camera_code) WHERE (camera_code IS NOT NULL);


--
-- Name: idx_cameras_entry_exit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cameras_entry_exit ON public.cameras USING btree (entry_exit_type);


--
-- Name: idx_cameras_health_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cameras_health_status ON public.cameras USING btree (health_status);


--
-- Name: idx_cameras_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cameras_location_id ON public.cameras USING btree (location_id);


--
-- Name: idx_cameras_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cameras_status ON public.cameras USING btree (status);


--
-- Name: idx_cameras_zone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cameras_zone_id ON public.cameras USING btree (zone_id);


--
-- Name: idx_employee_face_images_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_face_images_employee_id ON public.employee_face_images USING btree (employee_id);


--
-- Name: idx_employee_face_images_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_face_images_profile_id ON public.employee_face_images USING btree (face_profile_id);


--
-- Name: idx_employee_face_images_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_face_images_type ON public.employee_face_images USING btree (image_type);


--
-- Name: idx_employee_face_profiles_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_face_profiles_employee_id ON public.employee_face_profiles USING btree (employee_id);


--
-- Name: idx_employee_face_profiles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_face_profiles_status ON public.employee_face_profiles USING btree (profile_status);


--
-- Name: idx_employees_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_department ON public.employees USING btree (department);


--
-- Name: idx_employees_employee_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_employee_code ON public.employees USING btree (employee_code);


--
-- Name: idx_employees_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_location_id ON public.employees USING btree (location_id);


--
-- Name: idx_employees_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_status ON public.employees USING btree (status);


--
-- Name: idx_face_embeddings_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_embeddings_employee_id ON public.face_embeddings USING btree (employee_id);


--
-- Name: idx_face_embeddings_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_embeddings_profile_id ON public.face_embeddings_metadata USING btree (face_profile_id);


--
-- Name: idx_face_embeddings_source_image; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_face_embeddings_source_image ON public.face_embeddings USING btree (source_image_id) WHERE (source_image_id IS NOT NULL);


--
-- Name: idx_face_events_camera_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_events_camera_id ON public.face_events USING btree (camera_id);


--
-- Name: idx_face_events_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_events_employee_id ON public.face_events USING btree (employee_id);


--
-- Name: idx_face_events_event_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_events_event_time ON public.face_events USING btree (event_time);


--
-- Name: idx_face_events_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_events_processed ON public.face_events USING btree (processed);


--
-- Name: idx_face_reg_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_reg_audit_created ON public.face_registration_audit_log USING btree (created_at);


--
-- Name: idx_face_reg_audit_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_reg_audit_employee ON public.face_registration_audit_log USING btree (employee_id);


--
-- Name: idx_face_reg_audit_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_reg_audit_session ON public.face_registration_audit_log USING btree (session_id);


--
-- Name: idx_login_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_history_created_at ON public.login_history USING btree (created_at);


--
-- Name: idx_login_history_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_history_event_type ON public.login_history USING btree (event_type);


--
-- Name: idx_login_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_history_user_id ON public.login_history USING btree (user_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at);


--
-- Name: idx_notifications_read_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_read_at ON public.notifications USING btree (read_at);


--
-- Name: idx_notifications_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_role ON public.notifications USING btree (role);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_password_reset_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_token ON public.password_reset_tokens USING btree (token);


--
-- Name: idx_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_presence_logs_employee_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presence_logs_employee_date ON public.employee_presence_logs USING btree (employee_id, event_time);


--
-- Name: idx_presence_logs_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presence_logs_employee_id ON public.employee_presence_logs USING btree (employee_id);


--
-- Name: idx_presence_logs_event_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presence_logs_event_time ON public.employee_presence_logs USING btree (event_time);


--
-- Name: idx_unknown_faces_camera_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unknown_faces_camera_id ON public.unknown_faces USING btree (camera_id);


--
-- Name: idx_unknown_faces_detected_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unknown_faces_detected_at ON public.unknown_faces USING btree (detected_at);


--
-- Name: idx_unknown_faces_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unknown_faces_location_id ON public.unknown_faces USING btree (location_id);


--
-- Name: idx_users_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_email_lower ON public.users USING btree (lower((email)::text)) WHERE ((email IS NOT NULL) AND ((email)::text <> ''::text));


--
-- Name: ai_recognition_events ai_recognition_events_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_recognition_events
    ADD CONSTRAINT ai_recognition_events_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.cameras(id) ON DELETE SET NULL;


--
-- Name: attendance_logs attendance_logs_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.cameras(id);


--
-- Name: attendance_logs attendance_logs_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: attendance_logs attendance_logs_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: attendance_records attendance_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: attendance_records attendance_records_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: attendance_summary attendance_summary_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_summary
    ADD CONSTRAINT attendance_summary_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: attendance_summary attendance_summary_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_summary
    ADD CONSTRAINT attendance_summary_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: camera_events camera_events_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_events
    ADD CONSTRAINT camera_events_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.cameras(id) ON DELETE CASCADE;


--
-- Name: camera_health_logs camera_health_logs_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_health_logs
    ADD CONSTRAINT camera_health_logs_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.cameras(id) ON DELETE CASCADE;


--
-- Name: camera_zones camera_zones_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_zones
    ADD CONSTRAINT camera_zones_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: cameras cameras_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cameras
    ADD CONSTRAINT cameras_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.camera_zones(id) ON DELETE SET NULL;


--
-- Name: employee_face_images employee_face_images_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_face_images
    ADD CONSTRAINT employee_face_images_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_face_images employee_face_images_face_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_face_images
    ADD CONSTRAINT employee_face_images_face_profile_id_fkey FOREIGN KEY (face_profile_id) REFERENCES public.employee_face_profiles(id) ON DELETE CASCADE;


--
-- Name: employee_face_profiles employee_face_profiles_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_face_profiles
    ADD CONSTRAINT employee_face_profiles_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_presence_logs employee_presence_logs_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_presence_logs
    ADD CONSTRAINT employee_presence_logs_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.cameras(id) ON DELETE SET NULL;


--
-- Name: employee_presence_logs employee_presence_logs_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_presence_logs
    ADD CONSTRAINT employee_presence_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_presence_logs employee_presence_logs_face_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_presence_logs
    ADD CONSTRAINT employee_presence_logs_face_event_id_fkey FOREIGN KEY (face_event_id) REFERENCES public.face_events(id) ON DELETE SET NULL;


--
-- Name: employee_presence_logs employee_presence_logs_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_presence_logs
    ADD CONSTRAINT employee_presence_logs_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: employee_presence_state employee_presence_state_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_presence_state
    ADD CONSTRAINT employee_presence_state_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_presence_state employee_presence_state_last_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_presence_state
    ADD CONSTRAINT employee_presence_state_last_camera_id_fkey FOREIGN KEY (last_camera_id) REFERENCES public.cameras(id) ON DELETE SET NULL;


--
-- Name: employee_presence_state employee_presence_state_last_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_presence_state
    ADD CONSTRAINT employee_presence_state_last_location_id_fkey FOREIGN KEY (last_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: employees employees_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: employees employees_reporting_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_reporting_manager_id_fkey FOREIGN KEY (reporting_manager_id) REFERENCES public.employees(id);


--
-- Name: face_embeddings face_embeddings_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_embeddings
    ADD CONSTRAINT face_embeddings_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: face_embeddings face_embeddings_face_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_embeddings
    ADD CONSTRAINT face_embeddings_face_profile_id_fkey FOREIGN KEY (face_profile_id) REFERENCES public.employee_face_profiles(id) ON DELETE CASCADE;


--
-- Name: face_embeddings_metadata face_embeddings_metadata_face_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_embeddings_metadata
    ADD CONSTRAINT face_embeddings_metadata_face_profile_id_fkey FOREIGN KEY (face_profile_id) REFERENCES public.employee_face_profiles(id) ON DELETE CASCADE;


--
-- Name: face_embeddings face_embeddings_source_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_embeddings
    ADD CONSTRAINT face_embeddings_source_image_id_fkey FOREIGN KEY (source_image_id) REFERENCES public.employee_face_images(id) ON DELETE SET NULL;


--
-- Name: face_events face_events_attendance_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_events
    ADD CONSTRAINT face_events_attendance_log_id_fkey FOREIGN KEY (attendance_log_id) REFERENCES public.attendance_logs(id) ON DELETE SET NULL;


--
-- Name: face_events face_events_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_events
    ADD CONSTRAINT face_events_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.cameras(id) ON DELETE SET NULL;


--
-- Name: face_events face_events_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_events
    ADD CONSTRAINT face_events_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;


--
-- Name: face_events face_events_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_events
    ADD CONSTRAINT face_events_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: face_registration_audit_log face_registration_audit_log_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_registration_audit_log
    ADD CONSTRAINT face_registration_audit_log_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: face_registration_audit_log face_registration_audit_log_face_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_registration_audit_log
    ADD CONSTRAINT face_registration_audit_log_face_profile_id_fkey FOREIGN KEY (face_profile_id) REFERENCES public.employee_face_profiles(id) ON DELETE SET NULL;


--
-- Name: login_history login_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_history
    ADD CONSTRAINT login_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: unknown_faces unknown_faces_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unknown_faces
    ADD CONSTRAINT unknown_faces_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.cameras(id) ON DELETE SET NULL;


--
-- Name: unknown_faces unknown_faces_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unknown_faces
    ADD CONSTRAINT unknown_faces_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: user_permissions user_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict caDfK53LPiJ7uVxMfpTPrgfDfm4WpneJb4ijh87RU6BjLklcdu2IhxtvibTBEfe

