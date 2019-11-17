import * as debug from "debug";

interface Node {
    name: string
    size: number
    stringify: number
    parse: number
    children: NodeArray
}

interface NodeArray extends Array<Node> { }

export class Profiler {
    raw: string
    budget: number
    root: Node
    coro: Generator

    constructor(readonly cpuPerTick: number, depth = 3) {
        this.budget = 0;
        this.coro = this.inspecter(depth)
    }

    run() {
        const start = Game.cpu.getUsed();
        this.budget += this.cpuPerTick;
        let done = false;
        while (!done && this.budget > 0 && Game.cpu.getUsed() < start + this.cpuPerTick) {
            done = this.coro.next().done || false;
        }
        this.budget -= Game.cpu.getUsed() - start;
    }

    *inspecter(depth: number) {
        this.root = {
            name: "(root)"
        } as Node;
        yield* this.inspect(Memory, this.root, depth - 1);
    }

    *inspect(memory: any, node: Node, depth: number): IterableIterator<undefined> {
        if (!_.isObject(memory)) return;
        yield
        const prejson = Game.cpu.getUsed();
        const json = JSON.stringify(memory);
        const postjson = Game.cpu.getUsed();
        node.stringify = postjson - prejson;
        node.size = json.length;
        yield
        const preparse = Game.cpu.getUsed();
        const parse = JSON.parse(json);
        const postparse = Game.cpu.getUsed();
        node.parse = postparse - preparse;
        node.children = [];
        if (depth < 0 || !_.isObject(memory)) return;
        const kidnames = _.keys(parse);
        for (let kidname of kidnames) {
            const child = {
                name: kidname
            } as Node;
            yield* this.inspect(_.get(parse, kidname), child, depth - 1);
            node.children.push(child);
        }
    }

    drawSize(roomName: string) {
        this.draw(roomName, n => n.size);
    }

    drawCpu(roomName: string) {
        this.draw(roomName, n => n.parse + n.stringify);
    }

    drawParse(roomName: string) {
        this.draw(roomName, n => n.parse);
    }

    drawStringify(roomName: string) {
        this.draw(roomName, n => n.stringify);
    }

    draw(roomName: string, scale: (n: Node) => number) {
        const v = new RoomVisual(roomName);
        this.drawNode(v, this.root, 0, 0, 49, scale);
    }

    drawNode(v: RoomVisual, node: Node, x: number, y: number, h: number, scale: (n: Node) => number) {
        v.rect(x, y, 7, h, { fill: "blue" });
        v.rect(x, y, 14, h, { stroke: 'black', strokeWidth: (50 - x) / 100, fill:'' });
        v.text(node.name + ' ' + prettyMem(scale(node)), x + 0.25, y + 0.75, { align: 'left' });
        const total = _.sum(node.children, c => scale(c));
        let offset = 0;
        const kids = _.sortBy(node.children, c => -scale(c));
        for (let child of kids) {
            const mysize = scale(child);
            const ch = Math.min(h - offset, Math.ceil(mysize / total * h));
            if (ch >= 1) {
                this.drawNode(v, child, x + 7, y + offset, ch, scale);
            }
            offset += ch;
        }
    }
}

function prettyMem(x: number) {
    if (x > 1000) return (x / 1000).toFixed(1) + 'K';
    if (x > 10) return x.toFixed(0);
    return x.toFixed(1);
}