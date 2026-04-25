import pandas as pd
import os
from google import genai

def setup_gemini():
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        api_key = input("Introduce tu API Key de Google AI Studio: ")
        os.environ["GOOGLE_API_KEY"] = api_key
    # Inicializamos el nuevo cliente genai
    return genai.Client(api_key=api_key)

def load_data():
    data_path = 'data/creative_merged.csv'
    df = pd.read_csv(data_path)
    
    # Calcular ROAS (Return on Ad Spend)
    df['roas'] = df['total_revenue_usd'] / df['total_spend_usd']
    return df

def chatbot():
    print("🤖 Bienvenido al Chatbot de Insights de Smadex (Impulsado por Gemini)")
    try:
        client = setup_gemini()
    except Exception as e:
        print(f"Error configurando Gemini: {e}")
        return
    
    print("\nCargando datos de campañas...")
    try:
        df = load_data()
        print("✅ Datos cargados correctamente.")
    except Exception as e:
        print(f"❌ Error al cargar los datos: {e}")
        return
    
    while True:
        print("\n" + "="*60)
        campaign_input = input("Introduce el ID de una campaña o nombre de app para analizar (o 'salir' para terminar): ")
        
        if campaign_input.lower() in ['salir', 'exit', 'quit']:
            print("¡Hasta luego!")
            break
            
        # Intentar filtrar por ID de campaña o por nombre de la app (app_name)
        if campaign_input.isdigit():
            filtered_df = df[df['campaign_id'] == int(campaign_input)]
        else:
            filtered_df = df[df['app_name'].astype(str).str.contains(campaign_input, case=False, na=False)]
            
        if filtered_df.empty:
            print("❌ No se encontraron datos para esa campaña/app. Intenta con otro nombre o ID.")
            continue
            
        print(f"\nSe encontraron {len(filtered_df)} creatividades para esta búsqueda.")
        
        # Preparar los datos visuales y de rendimiento
        visual_features = [
            'theme', 'hook_type', 'cta_text', 'headline', 'dominant_color', 
            'emotional_tone', 'has_gameplay', 'width', 'height'
        ]
        
        performance_features = [
            'creative_id', 'creative_status', 'total_spend_usd', 'total_revenue_usd', 'roas'
        ]
        
        # Seleccionar columnas y ordenar por ROAS descendente para darle contexto al LLM
        context_df = filtered_df[visual_features + performance_features].sort_values('roas', ascending=False)
        
        # Convertir a texto CSV (limitado a top 50 creatividades para no sobrepasar límites de contexto)
        data_str = context_df.head(50).to_csv(index=False)
        
        system_instruction = f"""
Eres un analista experto en performance marketing que trabaja para una plataforma de anuncios móviles. 
Se te ha proporcionado la siguiente data de creatividades publicitarias para una campaña/app en particular. 
La data incluye características visuales de la creatividad (colores, tonos emocionales, hooks), así como métricas de rendimiento (gasto, ingresos y ROAS).

Tu objetivo es responder a las preguntas del usuario basándote EXCLUSIVAMENTE en estos datos.
Analiza qué enfoques visuales y creativos han funcionado mejor (alto ROAS, buen revenue) y cuáles han ido peor en esta campaña.
Da respuestas concisas, claras y orientadas a la acción.

Datos de la campaña (formato CSV ordenado por ROAS):
{data_str}
"""
        # Iniciamos la sesión de chat con el contexto cargado
        try:
            chat = client.chats.create(
                model="gemini-2.5-flash", 
                config={"system_instruction": system_instruction}
            )
            # Mandamos un mensaje inicial invisible para setear el contexto en el historial (opcional)
            response = chat.send_message("Confirma que has recibido los datos de la campaña y estás listo.")
        except Exception as e:
            print(f"\n❌ Error al crear el chat con Gemini: {e}")
            continue
        
        print("\n🤖 Gemini: ¡Datos analizados! Pregúntame qué ha ido mejor o peor en esta campaña (escribe 'volver' para cambiar de campaña).")
        
        # Bucle de conversación para esta campaña específica
        while True:
            user_msg = input("\nTú: ")
            
            if user_msg.lower() in ['volver', 'cambiar', 'otra']:
                print("\nVolviendo a la selección de campaña...")
                break
            if user_msg.lower() in ['salir', 'exit', 'quit']:
                print("¡Hasta luego!")
                return
            if not user_msg.strip():
                continue
                
            try:
                response = chat.send_message(user_msg)
                print(f"\n🤖 Gemini:\n{response.text}")
            except Exception as e:
                print(f"\n❌ Error al comunicarse con Gemini: {e}")

if __name__ == "__main__":
    chatbot()
