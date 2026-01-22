// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

export default function ClientEntry() {
	const root = document.getElementById("app");

	if (!root) throw Error("Root element not found");

	mount(() => <StartClient />, root);
}
