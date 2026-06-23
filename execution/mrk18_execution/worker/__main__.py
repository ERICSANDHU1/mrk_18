"""Entry point: `python -m mrk18_execution.worker`."""

from arq import run_worker

from .main import WorkerSettings

if __name__ == "__main__":
    run_worker(WorkerSettings)
