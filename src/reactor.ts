// Season 11 reactor helpers shared by ms.reactor and the immortan/warboy jobs.
// Leaf module: import nothing from missions or jobs here (avoids a require cycle).

// The Season 11 reactor lives in the sector core: the centre room of each
// 10x10 sector, whose coordinates both end in 5 (W5N5, W15N25, E5S5, ...).
export function sectorCore(roomName: string): string | null {
    const parsed = /^([WE])(\d{1,2})([NS])(\d{1,2})$/.exec(roomName);
    if (!parsed) return null;
    const x = Math.floor(parseInt(parsed[2], 10) / 10) * 10 + 5;
    const y = Math.floor(parseInt(parsed[4], 10) / 10) * 10 + 5;
    return `${parsed[1]}${x}${parsed[3]}${y}`;
}

// Season 11's Reactor is a RoomObject, not a Structure: its prototype has only
// owner, my, store and continuousWork, so FIND_STRUCTURES never returns it.
// Confirmed on the seasonal server: FIND_REACTORS=10051, LOOK_REACTORS="reactor",
// RESOURCE_THORIUM="T".
declare global {
    interface ReactorObject extends RoomObject {
        id: Id<ReactorObject>
        owner?: Owner
        my: boolean
        store: Store<ResourceConstant, false>
        continuousWork: number
    }
    // Only defined on the seasonal server; guard with typeof before use.
    const FIND_REACTORS: FindConstant | undefined;
    const LOOK_REACTORS: LookConstant | undefined;
    const RESOURCE_THORIUM: ResourceConstant | undefined;
}

// The thorium mineral in `room` that can be mined right now: an extractor on
// it and thorium left. Null without visibility.
export function thoriumMineral(room: Room | null): Mineral | null {
    if (!room || !RESOURCE_THORIUM) return null;
    return room.find(FIND_MINERALS, {
        filter: m => m.mineralType === RESOURCE_THORIUM && m.mineralAmount > 0 &&
            m.pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_EXTRACTOR),
    })[0] || null;
}

export function findReactors(room: Room): ReactorObject[] {
    if (typeof FIND_REACTORS === "undefined") return [];
    return room.find(FIND_REACTORS as FindConstant) as unknown as ReactorObject[];
}
