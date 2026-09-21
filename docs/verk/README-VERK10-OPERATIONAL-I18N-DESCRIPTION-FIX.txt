GLÖGGT Verk 10 – operational i18n description fix
18.09.2026

Lagfæring á reynsluakstri þýðanlegs rekstrartexta:
- heiti Verks var þegar að skipta um tungumál;
- lýsing Verks gerði það ekki vegna þess að tímabundna prófunarþýðingin var bundin við nákvæma textasamsvörun;
- prófunarfærslan #3 er nú tengd við tímabundnar þýðingar eftir source-id fyrir bæði heiti og lýsingu;
- frumtextinn er áfram varðveittur óbreyttur;
- engin Prisma migration og engin gagnaskrif.

Þetta er aðeins TEST_PROJECTION fyrir reynsluakstur. Varanlega lausnin verður rekjanlegt þýðingarlag í gagnalíkaninu.
