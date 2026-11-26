/* ARK Learning Lab: shared age bands, pathway activities and portfolio prompts. Used by index.html and portfolio.html. */
window.ARK = {
  bands: [
    {k:'6-8', a:'Ages 6–8', n:'Explorers', line:'Hands-on, mostly unplugged: drawing, building, counting and talking.'},
    {k:'9-11', a:'Ages 9–11', n:'Navigators', line:'Real charts, fair tests and first block code.'},
    {k:'12-14', a:'Ages 12–14', n:'Builders', line:'Real datasets, Python, prototypes and source checks.'},
    {k:'15-18', a:'Ages 15–18', n:'Architects', line:'Independent projects, policy writing and working tools.'}
  ],
  paths: [
    {id:'core', name:'Core Academy', tag:'Structured lessons', time:'60–90 minutes a lesson · 8 units of 4 lessons', link:'curriculum.html#sequence', linkText:'See all 8 units',
     acts:{
      '6-8':['Draw a river from source to sea and label three things that live in it','Plant two bean seeds in different spots and draw them every week','Vote on three family rules, then fix the one that isn’t working'],
      '9-11':['Read a real Danube flow chart and explain it in three sentences','Run a fair test: which soil holds the most water?','Compare two maps of the same border and list what is different'],
      '12-14':['Graph 24 years of river flow and find the driest year','Trace one food from farm to plate and cost each step','Check three sources on a disputed claim and rate how reliable each one is'],
      '15-18':['Compare two rivers fairly and write what the data cannot prove','Model a water budget for a town of 1,000 people through a drought','Write a two-page policy brief with evidence and one strong objection']},
     port:{'6-8':'A labelled river drawing and a seed diary','9-11':'A chart explanation and a fair-test results table','12-14':'A captioned graph and a source-check table','15-18':'A data analysis and a policy brief'}},
    {id:'unschool', name:'UnSchool', tag:'Learner-chosen projects', time:'2–4 project hours a week · 3 projects a year', link:'plans.html', linkText:'Make the learning plan',
     acts:{
      '6-8':['Pick a backyard question, like “Where do snails go when it’s dry?”','Keep a picture journal for two weeks','Give the family a three-minute tour of what you found'],
      '9-11':['Choose a project, like cutting your home’s water use','Measure a tap for a week, make one change, then measure again','Show the before-and-after chart and explain what changed'],
      '12-14':['Write a learning contract: question, evidence and three checkpoints','Interview someone who does this work for a living','Build a prototype, get feedback and improve it once'],
      '15-18':['Plan a six-week independent project with milestones','Run a small real test: a repair stall, a survey of 20 people or a product trial','Write up what worked, what failed and what you would do next']},
     port:{'6-8':'Journal pages and a drawing or recording of the tour','9-11':'A data log and a before-and-after chart','12-14':'The contract, interview notes and prototype versions 1 and 2','15-18':'A project plan, results and a final report'}},
    {id:'liberverse', name:'LIBERVERSE Learning Lab', tag:'Digital skills', time:'90 minutes a week · 6 modules and a 4-week capstone', link:'liberverse.html#modules', linkText:'See all 24 modules',
     acts:{
      '6-8':['Sort picture cards into share, ask a grown-up, or keep private','“Program” a grown-up with step-by-step instructions to make a sandwich','Build a cardboard block of a river city and give a tour'],
      '9-11':['Make a personal privacy checklist (no real passwords)','Build a block-code mini-game and keep a bug log','Train a card sorter, find where it gets things wrong, then fix it'],
      '12-14':['Write a Python tool that reads a spreadsheet','Use AI for a task and log every claim you checked or rejected','Play a paper ledger game and write a rule for fixing mistakes'],
      '15-18':['Build an accessible web tool for a community and test it with users','Test an AI model for bias and write a policy memo','Draft a charter for a made-up community and defend it to a panel']},
     port:{'6-8':'A sorting poster and an instruction card someone else can follow','9-11':'A working mini-game and its bug log','12-14':'A working script and an AI-use log','15-18':'A web prototype and a defended charter'}}
  ],
  pieces: [
    {t:'Question & map', d:'What am I trying to find out, and where?'},
    {t:'Observations & data', d:'What did I notice, count or measure?'},
    {t:'Design or build', d:'What did I make, test or write?'},
    {t:'Feedback & revision', d:'What advice did I get, and what did I change?'},
    {t:'Explain & reflect', d:'What did I learn, and what can’t my evidence prove?'}
  ],
  examples: {
    '6-8':['A drawing of my river with a question bubble','A tally chart of birds I saw in one week','A cardboard boat that floats','Version 2, after a grown-up’s tip','A one-minute show-and-tell, recorded or drawn'],
    '9-11':['An annotated river map and one question','A bar chart made from real gauge data','A tested soil or water-saving design','Mentor feedback and the change I made','A three-sentence explanation of what I found'],
    '12-14':['A research question and a source list','A cleaned dataset and a captioned graph','A working prototype or script','User feedback and version 2','A claim, evidence and reasoning page'],
    '15-18':['A problem statement and a systems map','An analysis that states its uncertainty','A tool, model or policy draft','Panel questions and my revisions','A defended recommendation and a note on its limits']
  }
};
