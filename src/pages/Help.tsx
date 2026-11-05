import Header from '../components/Header';

const card = 'space-y-2 rounded-xl bg-slate-900 p-4';

export default function Help() {
  return (
    <>
      <Header title="Ayuda" backTo="/" />
      <main className="mx-auto max-w-md space-y-4 p-4">
        <section className={card}>
          <h2 className="text-lg font-bold">Instalar en iPhone</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abrí esta página en Safari.</li>
            <li>Tocá Compartir y después "Agregar a inicio".</li>
            <li>Abrí Reencuentro desde el ícono de inicio.</li>
            <li>Recién ahí creá o importá tus grupos.</li>
          </ol>
          <p className="rounded-lg bg-amber-950 p-3 text-sm text-amber-100">
            <strong>Importante:</strong> en iPhone, la app instalada tiene un almacenamiento separado del de Safari. Lo que
            guardes en Safari no aparece en la app instalada.
          </p>
        </section>

        <section className={card}>
          <h2 className="text-lg font-bold">Instalar en Android</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abrí esta página en Chrome.</li>
            <li>Tocá el botón "Instalar", o el menú ⋮ y "Instalar app".</li>
          </ol>
        </section>

        <section className={card}>
          <h2 className="text-lg font-bold">Qué funciona sin señal</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>La app, tus grupos y el plan de reencuentro.</li>
            <li>El GPS, la brújula, la flecha y la distancia al punto.</li>
            <li>El mapa de la zona, si lo bajaste antes.</li>
            <li>Pasar un grupo a otro teléfono por QR.</li>
          </ul>
        </section>

        <section className={card}>
          <h2 className="text-lg font-bold">Qué no funciona</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>No se ve a los demás en vivo.</strong> Ningún navegador puede hacerlo sin red. Por eso el plan es acordar
              un punto y un horario. Si aparece algo de red, en "Ubicación del grupo" vas a ver el último lugar que mandó cada uno,
              con su antigüedad.
            </li>
            <li>No se puede bajar un mapa nuevo.</li>
            <li>
              El SMS usa la red del celular. Con mucha gente puede tardar o no salir, aunque suele andar mejor que los datos.
            </li>
          </ul>
        </section>

        <section className={card}>
          <h2 className="text-lg font-bold">Consejos para un evento con mucha gente</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Para grupos grandes, armá el grupo solo con los puntos y el plan, y pasá el link o el QR: cada uno escribe su nombre al
              entrar. El QR se puede leer las veces que haga falta, incluso impreso.
            </li>
            <li>Prepará todo en casa con WiFi, el día anterior. En el lugar puede no haber red para nada.</li>
            <li>Acordá el punto y los horarios antes de separarse. Es lo único que funciona seguro.</li>
            <li>Elegí puntos fáciles de reconocer y, si podés, en el borde del predio: el centro va a ser intransitable.</li>
            <li>Probá la app en modo avión antes de salir.</li>
            <li>
              Si el evento dura más de un día, cerrá el Modo Encuentro cuando no lo necesites: con la pantalla prendida y el GPS,
              la batería se va rápido. Llevá batería externa. Tus grupos y el mapa quedan guardados.
            </li>
            <li>
              Con el teléfono bloqueado, la app deja de enviar tu ubicación: ningún navegador deja seguir. Si te están buscando, usá
              Modo bolsillo en "Ubicación del grupo". Queda desbloqueado y gasta batería, así que usalo solo cuando haga falta.
            </li>
            <li>En iPhone, usá siempre la app instalada y no borres los datos de Safari ni la app antes de que termine el evento.</li>
            <li>Sin señal, el GPS puede tardar hasta un minuto en ubicarte la primera vez.</li>
            <li>La brújula se confunde cerca de metal e imanes. Alejá el teléfono de otros aparatos y confirmá con la distancia: si baja, vas bien.</li>
          </ul>
        </section>

        <section className={card}>
          <h2 className="text-lg font-bold">Privacidad</h2>
          <p>
            No hay cuentas. Nada sale de tu teléfono salvo lo que compartís vos: el link, el QR, el SMS y, solo si lo activás en
            "Ubicación del grupo", tu ubicación. Esa viaja cifrada con una clave que tiene únicamente tu grupo: nuestro servidor no
            puede leerla y se borra a los 3 días.
          </p>
        </section>
        <p data-testid="app-version" className="text-center text-sm text-slate-500">
          Versión {__APP_VERSION__}
        </p>
      </main>
    </>
  );
}
