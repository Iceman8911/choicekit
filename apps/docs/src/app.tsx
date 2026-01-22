import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import "./app.css";
import { SolidBaseRoot } from "@kobalte/solidbase/client";

export default function App() {
	return (
		<Router base={import.meta.env.SERVER_BASE_URL} root={SolidBaseRoot}>
			<FileRoutes />
		</Router>
	);
}
