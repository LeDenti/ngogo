// Copied from LeDenti/ferret src/engine at commit 09f9df6, types erased with Node stripTypeScriptTypes.
// Do not edit by hand: edit ferret, then re-run tools/import-ferret.mjs.
// Shared types for the Ferret engine.
// All money and mood math is integer-only (no floats). See tech.md.

// ---------------------------------------------------------------------------
// Mood (from .kiro/specs/mood/design.md)
// ---------------------------------------------------------------------------

                             
                                              
                                               
                                               
                                              
                                              
                                                                       
                                               
                                               
 

export const DEFAULT_MOOD_POLICY             = {
  stress_refusal_bps: 500,
  stress_default_bps: 3000,
  calm_repaid_bps: 1000,
  calm_buyback_bps: 500,
  decay_bps_per_tick: 100,
  tighten_bps: 5000,
  wary_from_bps: 2000,
  feral_from_bps: 6000,
};

                                                  

// ---------------------------------------------------------------------------
// Invoice pool (from .kiro/specs/invoice-pool/design.md)
// ---------------------------------------------------------------------------

                             
                                                                         
                                                                   
                                                                  
                                                                       
                                                                                 
                                                                         
                                                                   
 

export const DEFAULT_POOL_POLICY             = {
  max_share_bps: 3000,
  max_debtor_abs: 0,
  max_advance_bps: 9000,
  max_term: 90,
  grace: 7,
  min_face: 1,
  require_analysis: true,
};

                                                                              

                    
                 
                   
                       
                       
                        
                    
                
                   
                       
                            
                         
                   
                  
                     
                
                       
                   
                 

/** Thrown by a handler when a check fails. `apply` catches, journals, bumps mood. */
export class Refused extends Error {
           family        ;
  constructor(family        , text        ) {
    super(text);
    this.name = "Refused";
    this.family = family;
  }
}

/** Internal record for a funded advance; only {status, repaid} is exposed in the snapshot. */
                                
                   
                 
               
                  
              
              
                 
                        
                    
 

                           
                  
                   
                      
                 
                      
                                  
                                    
                                                                      
                     
               
                                                     
 

                      
                                            
                                           
