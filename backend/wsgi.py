from app import create_app

app = create_app()


try:
    @app.get("/health")
    def health():
        return {"status": "ok"}, 200
except Exception:
    pass
