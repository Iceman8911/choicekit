import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import "./app.css";
import { SolidBaseRoot } from "@kobalte/solidbase/client";
import { GITHUB_PAGES_REPO_PATH } from "./lib/constants";

export default function App() {
	return (
		<Router base={GITHUB_PAGES_REPO_PATH} root={SolidBaseRoot}>
			dad
			<FileRoutes />
		</Router>
	);
}
