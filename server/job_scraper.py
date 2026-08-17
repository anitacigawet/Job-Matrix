#!/usr/bin/env python3
"""Multi-platform job scraper using JobSpy library
Supports: Indeed, Glassdoor, LinkedIn, ZipRecruiter, Google
"""

import sys
import json
import math
import os
from jobspy import scrape_jobs
import pandas as pd

# Suppress all output except our JSON result
sys.stderr = open(os.devnull, 'w')

# Map our platform names to JobSpy site_name values
PLATFORM_MAP = {
    "indeed": "indeed",
    "glassdoor": "glassdoor",
    "linkedin": "linkedin",
    "ziprecruiter": "zip_recruiter",
    "google": "google",
}

MAX_JOBS = 75
MAX_OUTPUT_BYTES = 3 * 1024 * 1024

def bounded_text(value, limit):
    if value is None:
        return None
    text = str(value)
    if len(text) <= limit:
        return text
    return text[:max(0, limit - 14)] + "\n[truncated]"

def search_jobs(search_term, location, platforms=None, distance=50, results_wanted=20, hours_old=None):
    """
    Search for jobs across multiple platforms using JobSpy
    
    Args:
        search_term: Job title or keywords
        location: Location string (e.g., "Kingman, AZ")
        platforms: List of platform names (default: ["indeed"])
        distance: Search radius in miles (default: 50)
        results_wanted: Number of results to return (default: 20)
        hours_old: Filter by hours since posted (optional)
    
    Returns:
        Dict with success, jobs list, count, and per-platform breakdown
    """
    if platforms is None:
        platforms = ["indeed"]
    
    # Map platform names to JobSpy site names
    site_names = []
    for p in platforms:
        mapped = PLATFORM_MAP.get(p.lower())
        if mapped:
            site_names.append(mapped)
    
    if not site_names:
        return {
            'success': False,
            'error': 'No valid platforms specified',
            'jobs': [],
            'count': 0,
            'platformBreakdown': {}
        }
    
    try:
        # Build scrape_jobs kwargs
        kwargs = {
            'site_name': site_names,
            'search_term': search_term,
            'location': location,
            'distance': distance,
            'results_wanted': results_wanted,
            'verbose': 0,
        }
        
        # Only add hours_old if specified (some platforms don't support it well)
        if hours_old:
            kwargs['hours_old'] = hours_old
        
        # Only add country_indeed if searching Indeed
        if 'indeed' in site_names:
            kwargs['country_indeed'] = 'USA'
        
        # Call JobSpy to scrape all platforms at once
        jobs_df = scrape_jobs(**kwargs)
        
        # Convert DataFrame to list of dictionaries
        if jobs_df is not None and len(jobs_df) > 0:
            # Replace NaN with None for JSON serialization
            jobs_df = jobs_df.where(pd.notna(jobs_df), None)
            jobs_list = jobs_df.to_dict('records')[:MAX_JOBS]
            
            # Transform to our schema
            transformed_jobs = []
            platform_counts = {}
            
            for job in jobs_list:
                # Convert date to string if present
                date_posted = job.get('date_posted')
                if date_posted and hasattr(date_posted, 'isoformat'):
                    date_posted = date_posted.isoformat()
                
                # Helper function to convert NaN to None
                def clean_value(val):
                    if isinstance(val, float) and math.isnan(val):
                        return None
                    return val
                
                # Determine the source platform
                site = clean_value(job.get('site', 'indeed'))
                # Reverse map from JobSpy site names back to our names
                platform = site
                if site == 'zip_recruiter':
                    platform = 'ziprecruiter'
                
                # Track per-platform counts
                platform_counts[platform] = platform_counts.get(platform, 0) + 1
                
                transformed_jobs.append({
                    'id': bounded_text(clean_value(job.get('id')), 500),
                    'title': bounded_text(clean_value(job.get('title')), 300),
                    'company': bounded_text(clean_value(job.get('company')), 300),
                    'location': bounded_text(f"{job.get('city', '') or ''}, {job.get('state', '') or ''}".strip(', '), 500),
                    'city': bounded_text(clean_value(job.get('city')), 160),
                    'state': bounded_text(clean_value(job.get('state')), 80),
                    'job_type': bounded_text(clean_value(job.get('job_type')), 120),
                    'salary_min': clean_value(job.get('min_amount')),
                    'salary_max': clean_value(job.get('max_amount')),
                    'salary_interval': bounded_text(clean_value(job.get('interval')), 80),
                    'job_url': bounded_text(clean_value(job.get('job_url')), 2048),
                    'description': bounded_text(clean_value(job.get('description')), 20000),
                    'date_posted': bounded_text(str(date_posted), 80) if date_posted else None,
                    'site': bounded_text(platform, 80),
                })
            
            return {
                'success': True,
                'jobs': transformed_jobs,
                'count': len(transformed_jobs),
                'platformBreakdown': platform_counts,
            }
        else:
            return {
                'success': True,
                'jobs': [],
                'count': 0,
                'platformBreakdown': {},
            }
            
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'jobs': [],
            'count': 0,
            'platformBreakdown': {},
        }

def main():
    """CLI interface
    Usage: python3 job_scraper.py <search_term> <location> [platforms] [distance] [results_wanted] [hours_old]
    platforms: comma-separated list, e.g., "indeed,glassdoor,linkedin"
    """
    if len(sys.argv) < 3:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python3 job_scraper.py <search_term> <location> [platforms] [distance] [results_wanted] [hours_old]',
            'jobs': [],
            'count': 0,
            'platformBreakdown': {},
        }))
        sys.exit(1)
    
    search_term = sys.argv[1]
    location = sys.argv[2]
    platforms = sys.argv[3].split(',') if len(sys.argv) > 3 else ['indeed']
    distance = int(sys.argv[4]) if len(sys.argv) > 4 else 50
    results_wanted = int(sys.argv[5]) if len(sys.argv) > 5 else 20
    hours_old = int(sys.argv[6]) if len(sys.argv) > 6 else None
    
    result = search_jobs(search_term, location, platforms, distance, results_wanted, hours_old)
    payload = json.dumps(result, separators=(',', ':'))
    if len(payload.encode('utf-8')) > MAX_OUTPUT_BYTES:
        payload = json.dumps({
            'success': False,
            'error': 'Job source returned too much data.',
            'jobs': [],
            'count': 0,
            'platformBreakdown': {},
        }, separators=(',', ':'))
    print(payload)

if __name__ == '__main__':
    main()
