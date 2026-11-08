import json
import re
import unicodedata
from pathlib import Path

import pandas as pd

MES_AVISO='2026-11'
JSON_ACADEMIA='C:\\Users\\elsac\\OneDrive\\Documentos\\CLASES\\academia_mvp_2026-10-31.json'
CARPETA_PDFS=r'C:\Users\elsac\OneDrive\Documentos\CLASES\CSHG_26_27\AVISOS\2026-11'
MODO_PRUEBA=False
LIMITE_PRUEBA=3
SALIDA_XLSX='alumnos.xlsx'


def normalizar(nombre):
    nombre = unicodedata.normalize("NFD", str(nombre))
    nombre = "".join(
        caracter
        for caracter in nombre
        if unicodedata.category(caracter) != "Mn"
    )
    return re.sub(r"[^a-zA-Z0-9]+", "_", nombre).strip("_").casefold()


def nombre_pdf(nombre):
    return f'aviso_{MES_AVISO}_{normalizar(nombre)}.pdf'


def clave_pdf(pdf):
    prefijo = f"aviso_{MES_AVISO}_"
    if not pdf.name.casefold().startswith(prefijo.casefold()):
        return ""

    nombre = pdf.stem[len(prefijo):]
    nombre = re.sub(r"\s+\(\d+\)$", "", nombre)
    return normalizar(nombre.replace("_", " "))


def normalizar_telefono(tel):

    tel = re.sub(r"\D", "", str(tel))

    if tel.startswith("34"):
        return tel

    if len(tel) == 9:
        return "34" + tel

    return tel

with open(JSON_ACADEMIA,encoding='utf-8') as f:
    data=json.load(f)

archivos_pdf = sorted(
    Path(CARPETA_PDFS).glob(f"aviso_{MES_AVISO}_*.pdf"),
    key=lambda pdf: (
        bool(re.search(r"\s+\(\d+\)$", pdf.stem)),
        pdf.name.casefold()
    )
)

alumnos_por_nombre = {}
for alumno in data.get('students', []):
    alumnos_por_nombre.setdefault(
        normalizar(alumno.get('name', '')),
        []
    ).append(alumno)

estados_previos = {}
if Path(SALIDA_XLSX).is_file():
    df_anterior = pd.read_excel(SALIDA_XLSX, dtype=str).fillna("")
    if "pdf" in df_anterior.columns and "enviado" in df_anterior.columns:
        for _, fila in df_anterior.iterrows():
            if str(fila.get("enviado", "")).strip().upper() == "SI":
                estados_previos[Path(str(fila["pdf"])).name.casefold()] = {
                    "enviado": "SI",
                    "fecha_envio": fila.get("fecha_envio", "")
                }

filas = []
alumnos_incluidos = set()
archivos_sin_alumno = []
for archivo in archivos_pdf:
    clave = clave_pdf(archivo)
    coincidencias = alumnos_por_nombre.get(clave, [])
    if not coincidencias:
        archivos_sin_alumno.append(archivo.name)
        continue

    alumno = coincidencias[0]
    nombre = alumno.get('name', '').strip()
    if clave in alumnos_incluidos:
        continue
    alumnos_incluidos.add(clave)

    telefono = normalizar_telefono(alumno.get("phone", ""))
    ruta = str(archivo)
    estado_previo = estados_previos.get(archivo.name.casefold(), {})
    filas.append({
        'nombre': nombre,
        'telefono': telefono,
        'activo': 'SI',
        'pdf': archivo.name,
        'pdf_existe': True,
        'ruta_pdf': ruta,
        'fecha_envio': estado_previo.get('fecha_envio', ''),
        'enviado': estado_previo.get('enviado', ''),
        'error': ''
    })

df = pd.DataFrame(filas)
if MODO_PRUEBA:
    candidatos = df[df['pdf_existe']].head(LIMITE_PRUEBA)
else:
    candidatos = df[df['pdf_existe']]

print('='*70)
print('PREVISUALIZACION')
print('='*70)
print('PDF del mes leídos:',len(archivos_pdf))
print('Alumnos activos incluidos:',len(df))
print('Pendientes:',int(candidatos['enviado'].fillna('').str.strip().str.upper().ne('SI').sum()))
print('Duplicados omitidos:',len(archivos_pdf) - len(alumnos_incluidos) - len(archivos_sin_alumno))
if archivos_sin_alumno:
    print('PDF sin alumno coincidente:', ', '.join(archivos_sin_alumno))
print('\nDestinatarios:')
for _,r in candidatos.iterrows():
    estado = 'YA ENVIADO' if str(r['enviado']).strip().upper() == 'SI' else 'PENDIENTE'
    print('-',r['nombre'],f"({estado})")

resp=input('\nEscribe SI para generar validacion: ').strip().upper()
if resp=='SI':
    candidatos.to_excel(SALIDA_XLSX,index=False)
    print('Generado:',SALIDA_XLSX)
else:
    print('Cancelado')
