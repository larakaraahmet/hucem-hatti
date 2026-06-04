import warnings; warnings.filterwarnings('ignore')
import sys; sys.path.insert(0,'.')
import os

os.environ['DATABASE_URL'] = 'postgresql://postgres.zfbshjkuqjtkjmrfxqez:cemdunyakupasi2026izliyor!@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'

from sources.understat import UnderstatSource
from sources.writer import DBWriter
from sqlalchemy import create_engine

engine = create_engine(os.environ['DATABASE_URL'])
src = UnderstatSource(cache=True)
writer = DBWriter(engine)

toplam = 0
for lig in ['EPL', 'LaLiga', 'Bundesliga', 'SerieA', 'Ligue1']:
    r = src.fetch(lig, '2025')
    s = writer.write([r])
    print(lig, s['player_stats'])
    toplam += s['player_stats']
print('TOPLAM:', toplam)
