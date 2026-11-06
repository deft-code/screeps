// Energy a room's storage is kept above before the surplus roles spawn.
export const EnergyReserve = 150000

// Spawn energy capacity at each RCL (spawn + extensions).
export const RCL1Energy = 300
export const RCL2Energy = 550
export const RCL3Energy = 800
export const RCL4Energy = 1300
export const RCL5Energy = 1800
export const RCL6Energy = 2300
export const RCL7Energy = 5600
export const RCL8Energy = 12900

export const ReactOrder: ResourceConstant[] = [
  RESOURCE_CATALYZED_UTRIUM_ACID,
  RESOURCE_CATALYZED_GHODIUM_ACID,
  RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
  RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
  RESOURCE_CATALYZED_ZYNTHIUM_ACID,
  RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
  RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
  RESOURCE_GHODIUM,
  RESOURCE_CATALYZED_LEMERGIUM_ACID
]

export const CoreMinerals: ResourceConstant[] = [
  RESOURCE_CATALYST,
  RESOURCE_ENERGY,
  RESOURCE_HYDROGEN,
  RESOURCE_KEANIUM,
  RESOURCE_LEMERGIUM,
  RESOURCE_OXYGEN,
  RESOURCE_POWER,
  RESOURCE_UTRIUM,
  RESOURCE_ZYNTHIUM
]

// Product -> its two inputs; the base minerals map to [].
export const Reactions: { [product: string]: ResourceConstant[] } = {
  'H': [],
  'K': [],
  'L': [],
  'O': [],
  'U': [],
  'X': [],
  'Z': [],

  'OH': ['O', 'H'],
  'ZK': ['Z', 'K'],
  'UL': ['U', 'L'],

  'G': ['ZK', 'UL'],

  'GO': ['G', 'O'],
  'KO': ['K', 'O'],
  'LO': ['L', 'O'],
  'UO': ['U', 'O'],
  'ZO': ['Z', 'O'],

  'GH': ['G', 'H'],
  'KH': ['K', 'H'],
  'LH': ['L', 'H'],
  'UH': ['U', 'H'],
  'ZH': ['Z', 'H'],

  'GH2O': ['GH', 'OH'],
  'KH2O': ['KH', 'OH'],
  'LH2O': ['LH', 'OH'],
  'UH2O': ['UH', 'OH'],
  'ZH2O': ['ZH', 'OH'],

  'GHO2': ['GO', 'OH'],
  'KHO2': ['KO', 'OH'],
  'LHO2': ['LO', 'OH'],
  'UHO2': ['UO', 'OH'],
  'ZHO2': ['ZO', 'OH'],

  'XGH2O': ['X', 'GH2O'],
  'XKH2O': ['X', 'KH2O'],
  'XLH2O': ['X', 'LH2O'],
  'XUH2O': ['X', 'UH2O'],
  'XZH2O': ['X', 'ZH2O'],

  'XGHO2': ['X', 'GHO2'],
  'XKHO2': ['X', 'KHO2'],
  'XLHO2': ['X', 'LHO2'],
  'XUHO2': ['X', 'UHO2'],
  'XZHO2': ['X', 'ZHO2']
}

// Product -> every reaction on the way to it, in order.
export const ReactionAll: { [product: string]: ResourceConstant[] } = {
  'G': ['ZK', 'UL', 'G'],
  'GO': ['ZK', 'UL', 'G', 'GO'],
  'GH': ['ZK', 'UL', 'G', 'GH'],

  'GH2O': ['ZK', 'UL', 'G', 'OH', 'GH', 'GH2O'],
  'KH2O': ['KH', 'OH', 'KH2O'],
  'LH2O': ['LH', 'OH', 'LH2O'],
  'UH2O': ['UH', 'OH', 'UH2O'],
  'ZH2O': ['ZH', 'OH', 'ZH2O'],

  'GHO2': ['ZK', 'UL', 'G', 'OH', 'GO', 'GHO2'],
  'KHO2': ['KO', 'OH', 'KHO2'],
  'LHO2': ['LO', 'OH', 'LHO2'],
  'UHO2': ['UO', 'OH', 'UHO2'],
  'ZHO2': ['ZO', 'OH', 'ZHO2'],

  'XGH2O': ['ZK', 'UL', 'G', 'OH', 'GH', 'GH2O', 'XGH2O'],
  'XKH2O': ['KH', 'OH', 'KH2O', 'XKH2O'],
  'XLH2O': ['LH', 'OH', 'LH2O', 'XLH2O'],
  'XUH2O': ['UH', 'OH', 'UH2O', 'XUH2O'],
  'XZH2O': ['ZH', 'OH', 'ZH2O', 'XZH2O'],

  'XGHO2': ['ZK', 'UL', 'G', 'OH', 'GO', 'GHO2', 'XGHO2'],
  'XKHO2': ['KO', 'OH', 'KHO2', 'XKHO2'],
  'XLHO2': ['LO', 'OH', 'LHO2', 'XLHO2'],
  'XUHO2': ['UO', 'OH', 'UHO2', 'XUHO2'],
  'XZHO2': ['ZO', 'OH', 'ZHO2', 'XZHO2']
}
