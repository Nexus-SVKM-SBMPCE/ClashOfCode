import sys
sys.path.insert(0, ".")
from app.main import app
routes = [getattr(r, 'path', str(r)) for r in app.routes]
print("Import OK")
print("Route count:", len(routes))
