import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routes import router
from app.services import ConflictError, InvalidChangeError, NotFoundError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def create_app() -> FastAPI:
    app = FastAPI(
        title="scan-inventory API",
        version="0.1.0",
        description="Review decisions and history for the scanned object inventory.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "PATCH", "POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(router)

    # Domain errors -> HTTP status codes, with a readable message in "detail".
    @app.exception_handler(NotFoundError)
    def not_found(_: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": f"{exc} not found"})

    @app.exception_handler(InvalidChangeError)
    def invalid(_: Request, exc: InvalidChangeError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(ConflictError)
    def conflict(_: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    return app


app = create_app()
