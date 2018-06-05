exports.EnergyReserve = 150000

exports.RCL1Energy = 300
exports.RCL2Energy = 550
exports.RCL3Energy = 800
exports.RCL4Energy = 1300
exports.RCL5Energy = 1800
exports.RCL6Energy = 2300
exports.RCL7Energy = 5600
exports.RCL8Energy = 12900

exports.ReactOrder = [
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

exports.CoreMinerals = [
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

exports.Reactions = {
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

exports.ReactionAll = {
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
