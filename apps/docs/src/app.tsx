import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import "./app.css";
import { SolidBaseRoot } from "@kobalte/solidbase/client";

export default function App() {
	return (
		<Router base="/sugarbox" root={SolidBaseRoot}>
			<FileRoutes />
		</Router>
	);
}
