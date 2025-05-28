import type ScriptState from '#/engine/script/ScriptState.js';
import World from '#/engine/World.js';


export function mes_broadcast_handler(state: ScriptState): void {
    const message = state.popString();
    World.broadcastMes(message);
}
