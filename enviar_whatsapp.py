import os
import time
import unicodedata
from datetime import datetime

import pandas as pd

from selenium import webdriver
from selenium.common.exceptions import TimeoutException

from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from selenium.webdriver.chrome.options import Options


# ==========================================
# CONFIGURACIÓN
# ==========================================

EXCEL = "alumnos.xlsx"
CARPETA_PDFS = "PDFS"

TIEMPO_CARGA_CHAT = 12
TIEMPO_CARGA_DOCUMENTO = 5

MENSAJE = (
    "Hola {nombre}.",
    "",
    "Te envío la nota de pago de las clases de {mes}.",
    "",
    "Por favor, realiza el bizum antes del día 5.",
    "",
    "Un saludo."
)

# ==========================================
# INICIAR CHROME
# ==========================================
def iniciar_driver():

    print("1")

    options = Options()

    perfil = os.path.abspath(
        "whatsapp_profile"
    )

    options.add_argument(
        f"--user-data-dir={perfil}"
    )

    print("Perfil:", perfil)

    driver = webdriver.Chrome(
        options=options
    )

    print("2")

    driver.maximize_window()

    print("3")

    return driver

# ==========================================
# BUSCAR INPUT DOCUMENTOS
# ==========================================

def obtener_input_adjuntos(driver):

    inputs = driver.find_elements(
        By.XPATH,
        "//input[@type='file']"
    )

    for i in inputs:

        try:
            if i.is_enabled():
                return i
        except:
            pass

    return None


# ==========================================
# ENVÍO DOCUMENTO
# ==========================================

def enviar_documento(
    driver,
    telefono,
    nombre,
    ruta_pdf,
    texto_mensaje=None
):

    url = (
        f"https://web.whatsapp.com/send"
        f"?phone={telefono}"
    )

    driver.get(url)

    wait = WebDriverWait(
        driver,
        120
    )

    print("Esperando carga del chat...")

    caja_mensaje = wait.until(
        EC.presence_of_element_located(
            (
                By.XPATH,
                "//div[@data-testid='conversation-compose-box-input']"
            )
        )
    )

    print("Chat cargado")

    time.sleep(3)

    boton_adjuntar = wait.until(
        EC.presence_of_element_located(
            (
                By.CSS_SELECTOR,
                "button[aria-label='Adjuntar']"
            )
        )
    )

    driver.execute_script(
        "arguments[0].click();",
        boton_adjuntar
    )

    print("Botón adjuntar pulsado")

    driver.execute_cdp_cmd(
        "Page.setInterceptFileChooserDialog",
        {"enabled": True}
    )

    opcion_documento = wait.until(
        EC.element_to_be_clickable(
            (
                By.XPATH,
                "//span[normalize-space()='Documento']"
            )
        )
    )
    opcion_documento.click()

    print("Opción Documento seleccionada")
    print("Esperando selector del documento...")

    try:
        input_file = WebDriverWait(driver, 30).until(
            EC.presence_of_element_located(
                (
                    By.XPATH,
                    "//input[@type='file' and not(@accept='image/*')]"
                )
            )
        )
    except TimeoutException as error:
        tipos_aceptados = [
            elemento.get_attribute("accept")
            for elemento in driver.find_elements(
                By.XPATH,
                "//input[@type='file']"
            )
        ]
        raise RuntimeError(
            "WhatsApp no abrió el selector de documentos. "
            f"Entradas de archivo detectadas: {tipos_aceptados}"
        ) from error

    print(
        "Selector de documento disponible:",
        input_file.get_attribute("accept")
    )

    print("Cargando PDF...")
    input_file.send_keys(
        os.path.abspath(ruta_pdf)
    )

    print("Esperando previsualización...")

    # Esperar previsualización

    caption = wait.until(
        EC.presence_of_element_located(
            (
                By.XPATH,
                "//div[@data-testid='media-caption-input-container' and @contenteditable='true']"
            )
        )
    )

    print("Previsualización PDF detectada")

    # Obtener mes

    pdf = os.path.basename(ruta_pdf)

    nombre_pila = nombre.strip().split(maxsplit=1)[0]
    periodo = pdf.split("_", maxsplit=2)[1]
    fecha_mes = datetime.strptime(periodo, "%Y-%m")
    meses = (
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre",
        "Diciembre"
    )
    mes = f"{meses[fecha_mes.month - 1]} {fecha_mes.year}"

    # Construir mensaje

    lineas = (
        texto_mensaje.splitlines()
        if texto_mensaje is not None
        else [
            linea.format(nombre=nombre_pila, mes=mes)
            for linea in MENSAJE
        ]
    )

    # Escribir comentario línea a línea

    caption.click()

    for i, linea in enumerate(lineas):

        if linea:
            caption.send_keys(linea)

        if i < len(lineas) - 1:
            caption.send_keys(
                Keys.SHIFT,
                Keys.ENTER
            )

    print("Comentario escrito")

    time.sleep(2)

    boton_enviar = wait.until(
        EC.element_to_be_clickable(
            (
                By.XPATH,
                "//div[@role='button' and contains(@aria-label,'Enviar') "
                "and @aria-disabled='false']"
            )
        )
    )

    print("Botón enviar localizado")

    nombre_pdf = os.path.basename(ruta_pdf)

    def mensaje_coincide(mensaje):
        return (
            nombre_pdf in mensaje.text
            and all(
                linea in mensaje.text
                for linea in lineas
                if linea
            )
        )

    mensajes_antes = sum(
        mensaje_coincide(mensaje)
        for mensaje in driver.find_elements(
            By.XPATH,
            "//*[@data-testid='msg-container']"
        )
    )

    boton_enviar.click()

    print("Enviando PDF...")

    wait.until(
    EC.invisibility_of_element_located(
        (
            By.XPATH,
            "//div[@data-testid='media-caption-input-container' and @contenteditable='true']"
        )
    )
)

    print("Previsualización cerrada")

    def comprobar_envio(navegador):
        mensajes = [
            mensaje
            for mensaje in navegador.find_elements(
                By.XPATH,
                "//*[@data-testid='msg-container']"
            )
            if mensaje_coincide(mensaje)
        ]

        if len(mensajes) <= mensajes_antes:
            return False

        ultimo_mensaje = mensajes[-1]
        if ultimo_mensaje.find_elements(
            By.CSS_SELECTOR,
            "[data-testid='fail-container']"
        ):
            return "fallido"

        etiquetas = [
            elemento.get_attribute("aria-label") or ""
            for elemento in ultimo_mensaje.find_elements(
                By.XPATH,
                ".//*[@aria-label]"
            )
        ]
        etiquetas_normalizadas = [
            "".join(
                caracter
                for caracter in unicodedata.normalize(
                    "NFD",
                    etiqueta.strip()
                )
                if unicodedata.category(caracter) != "Mn"
            ).lower()
            for etiqueta in etiquetas
        ]
        es_saliente = (
            any(
                etiqueta.startswith(("tu:", "you:"))
                for etiqueta in etiquetas_normalizadas
            )
            or ultimo_mensaje.find_elements(
                By.CSS_SELECTOR,
                "[data-icon='tail-out']"
            )
        )
        tiene_estado_enviado = any(
            etiqueta.startswith(("enviado", "entregado", "leido"))
            for etiqueta in etiquetas_normalizadas
        )

        if es_saliente and tiene_estado_enviado:
            return "enviado"

        return False

    try:
        estado_envio = WebDriverWait(driver, 60).until(comprobar_envio)
        if estado_envio == "fallido":
            raise RuntimeError(
                "WhatsApp indicó que el mensaje no se envió."
            )
    except TimeoutException as error:
        raise RuntimeError(
            "La vista previa se cerró, pero WhatsApp no confirmó "
            "el envío del documento. Comprueba el chat antes de reintentar."
        ) from error

    print("Documento y mensaje enviados en el chat")


# ==========================================
# ACTUALIZAR EXCEL
# ==========================================

def guardar_estado(df):

    df.to_excel(
        EXCEL,
        index=False
    )


# ==========================================
# PROCESO
# ==========================================

def procesar_envios():

    if not os.path.exists(EXCEL):
        raise FileNotFoundError(
            f"No existe {EXCEL}"
        )

    df = pd.read_excel(
            EXCEL,
            dtype=str
        ).fillna("")

    columnas = [
        "nombre",
        "telefono",
        "ruta_pdf"
    ]

    for col in columnas:

        if col not in df.columns:

            raise Exception(
                f"Falta la columna {col}"
            )

    if "enviado" not in df.columns:
        df["enviado"] = ""

    if "fecha_envio" not in df.columns:
        df["fecha_envio"] = ""

    if "error" not in df.columns:
        df["error"] = ""

    print("Inicio")

    driver = iniciar_driver()

    print("Driver OK")

    driver.get(
        "https://web.whatsapp.com"
    )

    print("WhatsApp abierto")

    total = len(df)

    enviados = 0
    errores = 0

    try:

        for idx, fila in df.iterrows():

            enviado = str(
                fila.get("enviado", "")
            ).strip().upper()

            if enviado == "SI":

                print(
                    f"[SKIP] {fila['nombre']}"
                )

                continue

            nombre = str(
                fila["nombre"]
            ).strip()

            telefono = str(
                fila["telefono"]
            ).strip()

            fichero = str(
                fila["ruta_pdf"]
            ).strip()

            ruta_pdf = os.path.join(
                CARPETA_PDFS,
                fichero
            )

            print(
                f"\nEnviando a {nombre}"
            )

            if not os.path.exists(ruta_pdf):

                df.loc[idx, "error"] = (
                    "PDF NO ENCONTRADO"
                )

                guardar_estado(df)

                errores += 1

                print(
                    "ERROR: PDF NO ENCONTRADO"
                )

                continue

            try:

                enviar_documento(
                    driver,
                    telefono,
                    nombre,
                    ruta_pdf
                )

                df.loc[idx, "enviado"] = "SI"

                df.loc[idx, "fecha_envio"] = (
                    datetime.now().strftime(
                        "%d/%m/%Y %H:%M:%S"
                    )
                )

                df.loc[idx, "error"] = ""

                guardar_estado(df)

                enviados += 1

                print("OK")

            except Exception as e:

                df.loc[idx, "enviado"] = ""
                df.loc[idx, "error"] = str(e)

                guardar_estado(df)

                errores += 1

                print(
                    f"ERROR: {e}"
                )

    finally:

        driver.quit()

    print("\n====================")
    print("RESUMEN")
    print("====================")

    print(f"Total     : {total}")
    print(f"Enviados  : {enviados}")
    print(f"Errores   : {errores}")


# ==========================================
# MAIN
# ==========================================

if __name__ == "__main__":

    procesar_envios()