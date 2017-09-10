global.kEnergyReserve = 150000;

global.kReactions = {
  'H': [],
  'K': [],
  'L': [],
  'O': [],
  'U': [],
  'X': [],
  'Z': [],

  'OH': ['O', 'H'],
  'ZK': ['Z','K'],
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
  'XZHO2': ['X', 'ZHO2'],
};

global.kReactionAll = {
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

  'XGHO2': ['ZK', 'UL', 'G', 'OH', 'GO', 'GHO2', 'XGHO2'],
  'XKHO2': ['KO', 'OH', 'KHO2', 'XKHO2'],
  'XLHO2': ['LO', 'OH', 'LHO2', 'XLHO2'],
  'XUHO2': ['UO', 'OH', 'UHO2', 'XUHO2'],
};
