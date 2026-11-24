import math
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from datetime import date as Date
from typing import Literal, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = "/data/visite.db"
TABLES = {"au": "au_val", "ac": "ac_val"}
OTHER = {"au": "ac", "ac": "au"}  # a visita congiunta always pairs one AU visit with one AC visit


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def migrate_sedi() -> None:
    """Renames the old "struttura" names to "sede": table strutture -> sedi, and in au/ac the columns
    nome_struttura -> nome_sede, struttura_campo -> sede_campo. Idempotent: on an already renamed DB it does nothing.
    SQLite updates the foreign keys pointing at the renamed table (val.sede_rif_id) by itself.
    The only place in the code that still names "struttura": it has to, to find the old schema."""
    with db() as conn:
        tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        if "strutture" in tables and "sedi" not in tables:
            conn.execute("ALTER TABLE strutture RENAME TO sedi")
        for table in TABLES:
            cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
            for before, after in (("nome_struttura", "nome_sede"), ("struttura_campo", "sede_campo")):
                if before in cols and after not in cols:
                    conn.execute(f"ALTER TABLE {table} RENAME COLUMN {before} TO {after}")


def init_sedi() -> None:
    """SA/SS belongs to the sede, not to a visit: one row per sede, never chosen when a visit is created.

    Sedi only existed as free text in the visits, so every sede that has no row yet gets a random SA or SS
    (idempotent: safe to run at every start, an existing sede keeps its campo)."""
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sedi (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
                campo TEXT NOT NULL CHECK (campo IN ('SA', 'SS'))
            )
            """
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO sedi (nome, campo)
            SELECT nome_sede, CASE WHEN abs(random()) % 2 = 0 THEN 'SA' ELSE 'SS' END
            FROM (SELECT nome_sede FROM au UNION SELECT nome_sede FROM ac)
            """
        )


def init_congiunte() -> None:
    """Visita congiunta (V-11): every visit carries its own expiry (data_scadenza), and `congiunte` links one AU visit
    to one AC visit of the same sede that were merged into a single on-site visit. UNIQUE on both sides: a visit
    is in at most one pair. Idempotent, like init_sedi."""
    with db() as conn:
        for table in TABLES:
            cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
            if "data_scadenza" not in cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN data_scadenza TEXT")
            if "confermata" not in cols:  # 1 = confirmed by the coordinator: it will be done
                conn.execute(f"ALTER TABLE {table} ADD COLUMN confermata INTEGER NOT NULL DEFAULT 0 CHECK (confermata IN (0, 1))")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS congiunte (
                au_id INTEGER NOT NULL UNIQUE REFERENCES au(id),
                ac_id INTEGER NOT NULL UNIQUE REFERENCES ac(id),
                PRIMARY KEY (au_id, ac_id)
            )
            """
        )


def init_vincoli() -> None:
    """Data the team constraints need: the 9 Veneto ULSS with their coordinates, each sede's position, and each
    person's ULSS and sede di riferimento, plus whether they are an external evaluator. Schema only (idempotent, like the other init_*); the rows are filled by a
    data script. NULL coordinates or a NULL ULSS mean the distance can't be checked, and it does not block."""
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ulss (
                id INTEGER PRIMARY KEY,
                nome TEXT NOT NULL,
                citta TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL
            )
            """
        )
        for table, columns in (
            ("sedi", {"citta": "TEXT", "lat": "REAL", "lon": "REAL", "posizione_di_prova": "INTEGER NOT NULL DEFAULT 0"}),
            ("val", {
                "ulss_id": "INTEGER REFERENCES ulss(id)",
                "sede_rif_id": "INTEGER REFERENCES sedi(id)",
                "esterno": "INTEGER NOT NULL DEFAULT 0 CHECK (esterno IN (0, 1))",  # "esterno" in data_model_ispezioni.xlsx
            }),
        ):
            existing = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
            for name, decl in columns.items():
                if name not in existing:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    migrate_sedi()  # before anything reads or creates the sedi table
    init_sedi()
    init_congiunte()
    init_vincoli()
    yield


app = FastAPI(title="Visite API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def split_competenze(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


class Ulss(BaseModel):
    id: int
    nome: str
    lat: float
    lon: float


class Person(BaseModel):
    id: str
    nome: str
    competenze: list[str]
    canLead: bool
    campi: list[str]  # the person's own SA/SS from val.sa / val.ss (read-only, may be empty)
    ulss: Optional[Ulss] = None  # ULSS di riferimento: the 50 km limit is measured from it
    sedeRiferimento: Optional[str] = None  # conflitto di interesse: never on a visit to this sede
    esterno: bool = False  # external evaluator (not Azienda Zero staff)


class Evaluator(BaseModel):
    id: str
    nome: str
    campo: Optional[str] = None


class Visita(BaseModel):
    id: str
    tipologia: str
    sede: str
    sedeCampo: Optional[str] = None
    competenzeRichieste: list[str]
    date: str
    startHour: int
    endHour: int
    teamLeaderId: Optional[str] = None
    teamLeaderNome: Optional[str] = None
    teamLeaderCampo: Optional[str] = None
    evaluators: list[Evaluator]
    scadenza: Optional[str] = None  # expiry of this AU/AC (yyyy-mm-dd), a visita congiunta must happen by the earlier of its two
    congiuntaCon: Optional[str] = None  # id of the paired visit ("ac-12") once merged into a visita congiunta
    sedeLat: Optional[float] = None  # where the sede is, for the 50 km limit
    sedeLon: Optional[float] = None
    confermata: bool = False  # confirmed by the coordinator: the visit will be done


class VisitaUpdate(BaseModel):
    date: str
    startHour: int
    endHour: int
    teamLeaderId: str
    evaluatorIds: list[str] = []


class VisitaCreate(VisitaUpdate):
    tipologia: Literal["AU", "AC"]
    sede: str  # the pratica's sede (comes from the process upstream)
    scadenza: Optional[str] = None  # the pratica's expiry (yyyy-mm-dd)


class CongiuntaIn(BaseModel):
    visitaId: str  # the visit already on the calendar ("ac-12"): the pratica becomes its other half
    scadenza: str  # the pratica's expiry


JOINT_MAX_DAYS = 183  # V-11: AU and AC expiries at most 6 months apart (src/lib/pratica.ts)


class WorkloadRow(BaseModel):
    id: str
    nome: str
    canLead: bool
    visiteTotali: int
    visiteAssegnate: int
    ratio: float


def _people(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT val.id, val.nome, val.competenze, val.sa, val.ss, val.esterno,
               CASE WHEN tl.id IS NOT NULL THEN 1 ELSE 0 END AS can_lead,
               u.id AS ulss_id, u.nome AS ulss_nome, u.lat AS ulss_lat, u.lon AS ulss_lon,
               s.nome AS sede_rif
        FROM val
        LEFT JOIN tl ON tl.id = val.id
        LEFT JOIN ulss u ON u.id = val.ulss_id
        LEFT JOIN sedi s ON s.id = val.sede_rif_id
        ORDER BY val.id
        """
    ).fetchall()


def _visite(conn: sqlite3.Connection, only: Optional[tuple[str, int]] = None) -> list[Visita]:
    """All visits, or just `only` = (table, id). Evaluators come from one query per table, not one per visit."""
    out: list[Visita] = []
    for tipo, table in (("AU", "au"), ("AC", "ac")):
        if only and only[0] != table:
            continue
        args = (only[1],) if only else ()
        where_j = "WHERE j.%s_id = ?" % table if only else ""
        where_v = "WHERE v.id = ?" if only else ""
        evaluators: dict[int, list[Evaluator]] = {}
        for e in conn.execute(
            f"""
            SELECT j.{table}_id AS visita_id, val.id, val.nome, j.campo
            FROM {TABLES[table]} j
            JOIN val ON val.id = j.val_id
            {where_j}
            ORDER BY val.id
            """,
            args,
        ):
            evaluators.setdefault(e["visita_id"], []).append(Evaluator(id=str(e["id"]), nome=e["nome"], campo=e["campo"]))
        rows = conn.execute(
            f"""
            SELECT v.id, v.nome_sede, v.competenze_richieste, v.data, v.ora_inizio, v.ora_fine,
                   COALESCE(s.campo, v.sede_campo) AS sede_campo,
                   v.team_leader_campo, v.team_leader_id, tl.nome AS team_leader_nome,
                   v.data_scadenza, v.confermata, c.{OTHER[table]}_id AS partner_id, s.lat AS sede_lat, s.lon AS sede_lon
            FROM {table} v
            LEFT JOIN sedi s ON s.nome = v.nome_sede
            LEFT JOIN tl ON tl.id = v.team_leader_id
            LEFT JOIN congiunte c ON c.{table}_id = v.id
            {where_v}
            ORDER BY v.data, v.ora_inizio
            """,
            args,
        ).fetchall()
        for r in rows:
            out.append(
                Visita(
                    id=f"{table}-{r['id']}",
                    tipologia=tipo,
                    sede=r["nome_sede"],
                    sedeCampo=r["sede_campo"],
                    competenzeRichieste=split_competenze(r["competenze_richieste"]),
                    date=r["data"],
                    startHour=r["ora_inizio"],
                    endHour=r["ora_fine"],
                    teamLeaderId=str(r["team_leader_id"]) if r["team_leader_id"] is not None else None,
                    teamLeaderNome=r["team_leader_nome"],
                    teamLeaderCampo=r["team_leader_campo"],
                    evaluators=evaluators.get(r["id"], []),
                    scadenza=r["data_scadenza"],
                    congiuntaCon=f"{OTHER[table]}-{r['partner_id']}" if r["partner_id"] is not None else None,
                    sedeLat=r["sede_lat"],
                    sedeLon=r["sede_lon"],
                    confermata=bool(r["confermata"]),
                )
            )
    return out


def _parse_visita_id(visita_id: str) -> tuple[str, int]:
    table, _, raw_id = visita_id.partition("-")
    if table not in TABLES or not raw_id.isdigit():
        raise HTTPException(status_code=404, detail=f"visita '{visita_id}' non trovata")
    return table, int(raw_id)


@app.get("/team", response_model=list[Person])
def get_team():
    with db() as conn:
        return [
            Person(
                id=str(r["id"]),
                nome=r["nome"],
                competenze=split_competenze(r["competenze"]),
                canLead=bool(r["can_lead"]),
                campi=[c for c, flag in (("SA", r["sa"]), ("SS", r["ss"])) if flag],
                ulss=Ulss(id=r["ulss_id"], nome=r["ulss_nome"], lat=r["ulss_lat"], lon=r["ulss_lon"]) if r["ulss_id"] else None,
                sedeRiferimento=r["sede_rif"],
                esterno=bool(r["esterno"]),
            )
            for r in _people(conn)
        ]


@app.get("/visite", response_model=list[Visita])
def get_visite():
    with db() as conn:
        return _visite(conn)


@app.get("/workload", response_model=list[WorkloadRow])
def get_workload():
    """Load = visits a person takes part in (team leader or evaluator) / all visits. No competenze matching any more.
    A visita congiunta is one visit on site, so its two halves count once (keyed on the AU half)."""
    with db() as conn:
        people = _people(conn)
        visite = _visite(conn)

    keys: set[str] = set()
    by_person: dict[str, set[str]] = {}
    for v in visite:
        key = v.congiuntaCon if v.tipologia == "AC" and v.congiuntaCon else v.id
        keys.add(key)
        for pid in {v.teamLeaderId, *(e.id for e in v.evaluators)} - {None}:
            by_person.setdefault(pid, set()).add(key)

    total = len(keys)
    out = []
    for p in people:
        pid = str(p["id"])
        assigned = len(by_person.get(pid, ()))
        out.append(
            WorkloadRow(
                id=pid,
                nome=p["nome"],
                canLead=bool(p["can_lead"]),
                visiteTotali=total,
                visiteAssegnate=assigned,
                ratio=assigned / total if total else 0.0,
            )
        )
    return out


def _write_visita(
    conn: sqlite3.Connection,
    table: str,
    raw_id: int,
    date: str,
    start: int,
    end: int,
    tl_id: Optional[int],
    evaluator_ids: list[str],
) -> None:
    """Sets date/time/team leader and replaces the evaluator list, keeping each evaluator's existing SA/SS campo."""
    join_table = TABLES[table]
    existing_campo = {
        str(row["val_id"]): row["campo"]
        for row in conn.execute(f"SELECT val_id, campo FROM {join_table} WHERE {table}_id = ?", (raw_id,))
    }
    conn.execute(
        f"UPDATE {table} SET data = ?, ora_inizio = ?, ora_fine = ?, team_leader_id = ? WHERE id = ?",
        (date, start, end, tl_id, raw_id),
    )
    conn.execute(f"DELETE FROM {join_table} WHERE {table}_id = ?", (raw_id,))
    for val_id in evaluator_ids:
        conn.execute(
            f"INSERT INTO {join_table} ({table}_id, val_id, campo) VALUES (?, ?, ?)",
            (raw_id, int(val_id), existing_campo.get(val_id)),
        )


def _partner(conn: sqlite3.Connection, table: str, raw_id: int) -> Optional[int]:
    row = conn.execute(f"SELECT {OTHER[table]}_id AS p FROM congiunte WHERE {table}_id = ?", (raw_id,)).fetchone()
    return row["p"] if row else None


def _pair(conn: sqlite3.Connection, table: str, raw_id: int, partner_id: Optional[int]) -> list[Visita]:
    out = _visite(conn, (table, raw_id))
    if partner_id is not None:
        out += _visite(conn, (OTHER[table], partner_id))
    return out


AC_WINDOW = ("2026-08-01", "2026-12-01")  # accreditamenti only in this period: same as src/lib/accreditationWindow.ts

# Team constraints: they hold for the team leader and for every evaluator (same rules as src/lib/vincoli.ts)
MAX_KM = 50  # from the person's ULSS di riferimento to the sede being visited
GAP_HOURS = 3  # between the end of one visit and the start of the next, same person, same day


def km_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance (haversine) in km."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def _team_problems(
    conn: sqlite3.Connection, table: str, raw_id: int, partner_id: Optional[int], payload: "VisitaUpdate"
) -> list[str]:
    """Every constraint the proposed team breaks, as Italian messages (empty list = team is valid)."""
    problems: list[str] = []
    vals = payload.evaluatorIds
    if not vals:
        problems.append("il team minimo è un team leader e un valutatore")
    if payload.teamLeaderId in vals:
        problems.append("una persona non può essere team leader e valutatore della stessa visita")
    if len(set(vals)) != len(vals):
        problems.append("una persona compare due volte tra i valutatori")
    if conn.execute("SELECT 1 FROM tl WHERE id = ?", (payload.teamLeaderId,)).fetchone() is None:
        problems.append("il team leader va scelto tra le persone abilitate a guidare")

    sede = conn.execute(
        f"SELECT v.nome_sede AS nome, s.lat, s.lon FROM {table} v LEFT JOIN sedi s ON s.nome = v.nome_sede WHERE v.id = ?",
        (raw_id,),
    ).fetchone()
    # this visit (and, for a congiunta, its other half) is never a clash with itself
    own = {(table, raw_id)} | ({(OTHER[table], partner_id)} if partner_id is not None else set())
    for pid in dict.fromkeys([payload.teamLeaderId, *vals]):
        p = conn.execute(
            """
            SELECT val.nome, u.nome AS ulss_nome, u.lat, u.lon, s.nome AS sede_rif
            FROM val LEFT JOIN ulss u ON u.id = val.ulss_id LEFT JOIN sedi s ON s.id = val.sede_rif_id
            WHERE val.id = ?
            """,
            (pid,),
        ).fetchone()
        if p is None:
            problems.append(f"persona {pid} non trovata")
            continue
        if p["sede_rif"] and p["sede_rif"].casefold() == sede["nome"].casefold():
            problems.append(f"{p['nome']}: conflitto di interesse, è la sua sede di riferimento")
        if p["lat"] is not None and sede["lat"] is not None:
            km = km_between(p["lat"], p["lon"], sede["lat"], sede["lon"])
            if km > MAX_KM:
                problems.append(f"{p['nome']}: la sua ULSS ({p['ulss_nome']}) è a {km:.0f} km dalla sede, massimo {MAX_KM}")
        for t in TABLES:
            for o in conn.execute(
                f"""
                SELECT v.id, v.ora_inizio, v.ora_fine, v.nome_sede FROM {t} v
                WHERE v.data = ? AND (v.team_leader_id = ? OR EXISTS (SELECT 1 FROM {t}_val j WHERE j.{t}_id = v.id AND j.val_id = ?))
                """,
                (payload.date, pid, pid),
            ):
                if (t, o["id"]) in own:
                    continue
                if not (o["ora_fine"] + GAP_HOURS <= payload.startHour or payload.endHour + GAP_HOURS <= o["ora_inizio"]):
                    problems.append(
                        f"{p['nome']}: ha già una visita dalle {o['ora_inizio']}:00 alle {o['ora_fine']}:00 ({o['nome_sede']}), "
                        f"servono almeno {GAP_HOURS} ore tra una visita e l'altra"
                    )
    return list(dict.fromkeys(problems))  # a congiunta elsewhere shows up as two halves: report it once


def _check_slot(payload: VisitaUpdate) -> None:
    """Date and hours alone, before the team: a weekday, and the end after the start."""
    try:
        weekday = Date.fromisoformat(payload.date).weekday()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"data non valida: '{payload.date}'")
    if weekday >= 5:
        raise HTTPException(status_code=400, detail="le visite si fanno dal lunedì al venerdì")
    if payload.endHour <= payload.startHour:
        raise HTTPException(status_code=400, detail="l'ora di fine deve essere dopo l'ora di inizio")


@app.post("/visite", response_model=Visita)
def create_visita(payload: VisitaCreate):
    """Schedules a new visit for a pratica (sede + tipologia) with its team. The row is written first so the team
    check sees the real sede; any broken constraint raises, and the connection closes without commit (rollback)."""
    _check_slot(payload)
    if payload.tipologia == "AC" and not (AC_WINDOW[0] <= payload.date <= AC_WINDOW[1]):
        raise HTTPException(status_code=400, detail=f"gli accreditamenti vanno programmati tra il {AC_WINDOW[0]} e il {AC_WINDOW[1]}")
    table = payload.tipologia.lower()
    with db() as conn:
        sede = conn.execute("SELECT nome, campo FROM sedi WHERE nome = ?", (payload.sede,)).fetchone()
        if sede is None:
            raise HTTPException(status_code=404, detail=f"sede '{payload.sede}' non trovata")
        raw_id = conn.execute(
            f"""INSERT INTO {table} (nome_sede, data, ora_inizio, ora_fine, numero_valutatori, sede_campo, data_scadenza)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (sede["nome"], payload.date, payload.startHour, payload.endHour, len(payload.evaluatorIds), sede["campo"], payload.scadenza),
        ).lastrowid
        problems = _team_problems(conn, table, raw_id, None, payload)
        if problems:
            raise HTTPException(status_code=400, detail="; ".join(problems))
        _write_visita(conn, table, raw_id, payload.date, payload.startHour, payload.endHour, int(payload.teamLeaderId), payload.evaluatorIds)
        return _visite(conn, (table, raw_id))[0]


@app.post("/visite/{visita_id}/conferma", response_model=list[Visita])
def conferma_visita(visita_id: str):
    """Marks the visit as confirmed (it will be done); a visita congiunta is confirmed whole. Returns the visit(s)."""
    table, raw_id = _parse_visita_id(visita_id)
    with db() as conn:
        if conn.execute(f"UPDATE {table} SET confermata = 1 WHERE id = ?", (raw_id,)).rowcount == 0:
            raise HTTPException(status_code=404, detail=f"visita '{visita_id}' non trovata")
        partner_id = _partner(conn, table, raw_id)
        if partner_id is not None:
            conn.execute(f"UPDATE {OTHER[table]} SET confermata = 1 WHERE id = ?", (partner_id,))
        return _pair(conn, table, raw_id, partner_id)


@app.delete("/visite/{visita_id}", response_model=list[str])
def delete_visita(visita_id: str):
    """Deletes the visit and its evaluators from the DB; a visita congiunta goes whole (both halves and the link).
    Returns the ids removed."""
    table, raw_id = _parse_visita_id(visita_id)
    with db() as conn:
        if conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (raw_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail=f"visita '{visita_id}' non trovata")
        partner_id = _partner(conn, table, raw_id)
        conn.execute(f"DELETE FROM congiunte WHERE {table}_id = ?", (raw_id,))
        removed = [(table, raw_id)] + ([(OTHER[table], partner_id)] if partner_id is not None else [])
        for t, i in removed:
            conn.execute(f"DELETE FROM {TABLES[t]} WHERE {t}_id = ?", (i,))
            conn.execute(f"DELETE FROM {t} WHERE id = ?", (i,))
        return [f"{t}-{i}" for t, i in removed]


@app.put("/visite/{visita_id}", response_model=list[Visita])
def update_visita(visita_id: str, payload: VisitaUpdate):
    """Returns the updated visit, plus its partner when it is a visita congiunta: both halves always move together."""
    table, raw_id = _parse_visita_id(visita_id)
    _check_slot(payload)

    with db() as conn:
        existing = conn.execute(f"SELECT id FROM {table} WHERE id = ?", (raw_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail=f"visita '{visita_id}' non trovata")
        partner_id = _partner(conn, table, raw_id)
        problems = _team_problems(conn, table, raw_id, partner_id, payload)
        if problems:
            raise HTTPException(status_code=400, detail="; ".join(problems))

        args = (payload.date, payload.startHour, payload.endHour, int(payload.teamLeaderId), payload.evaluatorIds)
        _write_visita(conn, table, raw_id, *args)
        if partner_id is not None:
            _write_visita(conn, OTHER[table], partner_id, *args)
        return _pair(conn, table, raw_id, partner_id)


@app.post("/congiunte", response_model=list[Visita])
def create_congiunta(payload: CongiuntaIn):
    """The pratica joins a visit already on the calendar as its other half (AU+AC): the new half inherits date, time,
    team leader and evaluators, so the team constraints already hold. Returns [this visit, new half]."""
    table, raw_id = _parse_visita_id(payload.visitaId)
    other = OTHER[table]
    with db() as conn:
        v = conn.execute(
            f"SELECT nome_sede, data, ora_inizio, ora_fine, numero_valutatori, team_leader_id, sede_campo, data_scadenza FROM {table} WHERE id = ?",
            (raw_id,),
        ).fetchone()
        if v is None:
            raise HTTPException(status_code=404, detail=f"visita '{payload.visitaId}' non trovata")
        if _partner(conn, table, raw_id) is not None:
            raise HTTPException(status_code=409, detail="la visita fa già parte di una visita congiunta")
        if v["data"] < Date.today().isoformat():
            raise HTTPException(status_code=400, detail="la visita è già passata")
        if not (AC_WINDOW[0] <= v["data"] <= AC_WINDOW[1]):
            raise HTTPException(status_code=400, detail="una visita congiunta contiene un accreditamento: la data deve stare nella finestra AC")
        if not v["data_scadenza"]:
            raise HTTPException(status_code=400, detail="la visita non ha una scadenza: non si può verificare la regola dei 6 mesi")
        gap = abs((Date.fromisoformat(v["data_scadenza"]) - Date.fromisoformat(payload.scadenza)).days)
        if gap > JOINT_MAX_DAYS:
            raise HTTPException(status_code=400, detail=f"le scadenze distano {gap} giorni, massimo {JOINT_MAX_DAYS}")
        if v["data"] > min(v["data_scadenza"], payload.scadenza):
            raise HTTPException(status_code=400, detail="la visita è fissata dopo la prima delle due scadenze")

        new_id = conn.execute(
            f"""INSERT INTO {other} (nome_sede, data, ora_inizio, ora_fine, numero_valutatori, team_leader_id, sede_campo, data_scadenza)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (v["nome_sede"], v["data"], v["ora_inizio"], v["ora_fine"], v["numero_valutatori"], v["team_leader_id"], v["sede_campo"], payload.scadenza),
        ).lastrowid
        conn.execute(
            f"INSERT INTO {TABLES[other]} ({other}_id, val_id, campo) SELECT ?, val_id, campo FROM {TABLES[table]} WHERE {table}_id = ?",
            (new_id, raw_id),
        )
        au_id, ac_id = (raw_id, new_id) if table == "au" else (new_id, raw_id)
        conn.execute("INSERT INTO congiunte (au_id, ac_id) VALUES (?, ?)", (au_id, ac_id))
        return _pair(conn, table, raw_id, new_id)


@app.delete("/congiunte/{visita_id}", response_model=list[Visita])
def delete_congiunta(visita_id: str):
    """Splits a visita congiunta back into two visits (dates and teams stay as they are). Returns both halves."""
    table, raw_id = _parse_visita_id(visita_id)
    with db() as conn:
        partner_id = _partner(conn, table, raw_id)
        if partner_id is None:
            raise HTTPException(status_code=404, detail=f"la visita '{visita_id}' non è congiunta")
        conn.execute(f"DELETE FROM congiunte WHERE {table}_id = ?", (raw_id,))
        return _pair(conn, table, raw_id, partner_id)
